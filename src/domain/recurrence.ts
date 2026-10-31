/**
 * Recurring / pre-authorized payment rules (PLAN.md §5 Phase 5). Every occurrence is computed from
 * the anchor date, so a monthly rule anchored on the 31st lands on Feb 28 and is back on Mar 31.
 */
import { addDays, addMonths } from 'date-fns';

import { addDaysISO, daysBetween, parseISODate, toISODate } from './dates';
import { normalizePayee } from './dedupe';
import {
  isLiabilityAccount,
  type AccountType,
  type RecurringFrequency,
  type TransactionStatus,
  type TransactionType,
} from './types';

export type RecurrenceRule = {
  frequency: RecurringFrequency;
  /** Every N periods (1 = every month for a monthly rule). */
  interval: number;
  anchorDate: string;
  endDate: string | null;
};

const STEP: Record<RecurringFrequency, { months: number } | { days: number }> = {
  weekly: { days: 7 },
  biweekly: { days: 14 },
  monthly: { months: 1 },
  quarterly: { months: 3 },
  yearly: { months: 12 },
};

/** The longest a period can be, so jumping ahead from the anchor never skips an occurrence. */
const MAX_PERIOD_DAYS: Record<RecurringFrequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 31,
  quarterly: 92,
  yearly: 366,
};

const PER_YEAR: Record<RecurringFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};

function assertInterval(interval: number): void {
  if (!Number.isInteger(interval) || interval < 1) {
    throw new RangeError(`interval must be a positive integer, got ${interval}`);
  }
}

/** The n-th occurrence (0 = the anchor date itself). */
export function occurrenceAt(rule: RecurrenceRule, n: number): string {
  assertInterval(rule.interval);
  const anchor = parseISODate(rule.anchorDate);
  const step = STEP[rule.frequency];
  const k = n * rule.interval;
  return toISODate(
    'months' in step ? addMonths(anchor, step.months * k) : addDays(anchor, step.days * k),
  );
}

/** Occurrences between `from` and `to` inclusive, never before the anchor or after the end date. */
export function nextOccurrences(
  rule: RecurrenceRule,
  from: string,
  to: string,
  limit = 1000,
): string[] {
  const result: string[] = [];
  if (to < from) return result;
  const behind = daysBetween(rule.anchorDate, from);
  let n =
    behind > 0
      ? Math.max(0, Math.floor(behind / (MAX_PERIOD_DAYS[rule.frequency] * rule.interval)) - 1)
      : 0;
  while (result.length < limit) {
    const date = occurrenceAt(rule, n);
    if (date > to || (rule.endDate != null && date > rule.endDate)) break;
    if (date >= from) result.push(date);
    n++;
  }
  return result;
}

/** The first occurrence on or after `date`, or null once the rule has ended. */
export function firstOccurrenceOnOrAfter(rule: RecurrenceRule, date: string): string | null {
  const horizon = addDaysISO(date, MAX_PERIOD_DAYS[rule.frequency] * rule.interval + 1);
  return nextOccurrences(rule, date, horizon, 1)[0] ?? null;
}

/** What an amount works out to per month, e.g. a $120 yearly charge → $10. */
export function monthlyEquivalentCents(
  rule: Pick<RecurrenceRule, 'frequency' | 'interval'> & { amountCents: number },
): number {
  assertInterval(rule.interval);
  const monthly = Math.round((rule.amountCents * PER_YEAR[rule.frequency]) / (12 * rule.interval));
  return monthly === 0 ? 0 : monthly;
}

export type RunnableRule = RecurrenceRule & {
  isActive: boolean;
  autoCreate: boolean;
  /** For auto-create rules: the first occurrence not generated yet. Otherwise the next one due. */
  nextDate: string;
};

export type RecurringRunPlan = {
  /** Dates to create transactions for (auto-create rules only). */
  create: string[];
  /** The rule's new next date; null when it has ended. */
  nextDate: string | null;
};

/**
 * What to do with a rule when the app opens on `today`. Auto-create rules generate every
 * occurrence from their next date up to today; the new next date is after today, so running the
 * plan again the same day creates nothing (idempotent). Other rules just move their next date
 * forward to today or later.
 */
export function planRecurringRun(rule: RunnableRule, today: string): RecurringRunPlan {
  if (!rule.isActive) return { create: [], nextDate: rule.nextDate };
  if (rule.autoCreate) {
    return {
      create: rule.nextDate <= today ? nextOccurrences(rule, rule.nextDate, today) : [],
      nextDate:
        rule.nextDate > today
          ? rule.nextDate
          : firstOccurrenceOnOrAfter(rule, addDaysISO(today, 1)),
    };
  }
  return {
    create: [],
    nextDate: rule.nextDate >= today ? rule.nextDate : firstOccurrenceOnOrAfter(rule, today),
  };
}

/** Type for a transaction generated from a rule: a charge, or money arriving. */
export function recurringTransactionType(
  accountType: AccountType,
  amountCents: number,
): TransactionType {
  if (amountCents < 0) return 'purchase';
  return isLiabilityAccount(accountType) ? 'payment' : 'deposit';
}

export type DetectionTransaction = {
  accountId: string;
  date: string;
  payee: string;
  amountCents: number;
  status: TransactionStatus;
  transferGroupId: string | null;
  recurringId: string | null;
  categoryId: string | null;
};

export type RecurringSuggestion = {
  /** Stable id for dismissing: account + normalized payee. */
  key: string;
  accountId: string;
  payee: string;
  amountCents: number;
  categoryId: string | null;
  frequency: 'monthly';
  /** The latest matching charge, used as the rule's anchor. */
  anchorDate: string;
  /** How many months the charge was seen in. */
  months: number;
};

export function suggestionKey(accountId: string, payee: string): string {
  return `${accountId}|${normalizePayee(payee)}`;
}

/** Amounts within $2 or 10% of each other count as "similar" (prices drift, taxes round). */
function isSimilarAmount(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(200, Math.abs(b) * 0.1);
}

/** Charges older than this since their last occurrence are treated as cancelled. */
const STILL_ACTIVE_DAYS = 45;

/**
 * Charges that look like a monthly subscription: the same payee on one account, a similar amount,
 * in at least 3 different months, roughly a month apart, and seen recently. Payees that already
 * have a rule (`ruleKeys`) or that the user dismissed are skipped.
 */
export function detectRecurring(
  transactions: readonly DetectionTransaction[],
  {
    today,
    ruleKeys,
    dismissed,
  }: { today: string; ruleKeys: ReadonlySet<string>; dismissed: ReadonlySet<string> },
): RecurringSuggestion[] {
  const groups = new Map<string, DetectionTransaction[]>();
  for (const tx of transactions) {
    if (tx.status === 'void' || tx.transferGroupId || tx.recurringId || tx.amountCents >= 0)
      continue;
    const key = suggestionKey(tx.accountId, tx.payee);
    if (ruleKeys.has(key) || dismissed.has(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), tx]);
  }

  const suggestions: RecurringSuggestion[] = [];
  for (const [key, rows] of groups) {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    if (daysBetween(latest.date, today) > STILL_ACTIVE_DAYS) continue;

    // One charge per month: the latest similar one.
    const byMonth = new Map<string, DetectionTransaction>();
    for (const tx of sorted) {
      if (isSimilarAmount(tx.amountCents, latest.amountCents)) byMonth.set(tx.date.slice(0, 7), tx);
    }
    const monthly = [...byMonth.values()];
    if (monthly.length < 3) continue;
    const recent = monthly.slice(-3);
    const evenlySpaced = recent.every((tx, i) => {
      if (i === 0) return true;
      const gap = daysBetween(recent[i - 1].date, tx.date);
      return gap >= 20 && gap <= 40;
    });
    if (!evenlySpaced) continue;

    suggestions.push({
      key,
      accountId: latest.accountId,
      payee: latest.payee,
      amountCents: latest.amountCents,
      categoryId: [...sorted].reverse().find((tx) => tx.categoryId)?.categoryId ?? null,
      frequency: 'monthly',
      anchorDate: latest.date,
      months: monthly.length,
    });
  }
  return suggestions.sort((a, b) => a.payee.localeCompare(b.payee));
}
