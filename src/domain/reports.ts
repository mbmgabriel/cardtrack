/**
 * Spending reports (PLAN.md Phase 8). Uses the dashboard's spending rule (`isSpending`):
 * purchases, fees and interest count, refunds reduce their category, transfers never count.
 * All amounts here are positive = money spent, in one currency (no FX in v1).
 */
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  startOfMonth,
} from 'date-fns';

import { isSpending, type SpendingCandidate } from './dashboard';
import { parseISODate } from './dates';
import { payeeCategoryKey } from './csv';

export type ReportTransaction = SpendingCandidate & {
  accountId: string;
  categoryId: string | null;
  payee: string;
  date: string;
  amountCents: number;
};

export type Ranked<K> = { key: K; cents: number; share: number };

/** Net spending per key, largest first; keys that net to zero or less are left out. */
function rank<K>(totals: Map<K, number>): Ranked<K>[] {
  const positive = [...totals].filter(([, cents]) => cents > 0);
  const total = positive.reduce((sum, [, cents]) => sum + cents, 0);
  return positive
    .map(([key, cents]) => ({ key, cents, share: total === 0 ? 0 : cents / total }))
    .sort((a, b) => b.cents - a.cents);
}

function totalBy<K>(rows: readonly ReportTransaction[], keyOf: (r: ReportTransaction) => K) {
  const totals = new Map<K, number>();
  for (const row of rows) {
    if (!isSpending(row)) continue;
    const key = keyOf(row);
    totals.set(key, (totals.get(key) ?? 0) - row.amountCents);
  }
  return totals;
}

export function totalSpendingCents(rows: readonly ReportTransaction[]): number {
  const total = rows.filter(isSpending).reduce((sum, r) => sum - r.amountCents, 0);
  return total === 0 ? 0 : total;
}

/** Spending per category; `null` is uncategorized. */
export function spendingByCategory(rows: readonly ReportTransaction[]): Ranked<string | null>[] {
  return rank(totalBy(rows, (r) => r.categoryId));
}

export function spendingByAccount(rows: readonly ReportTransaction[]): Ranked<string>[] {
  return rank(totalBy(rows, (r) => r.accountId));
}

export type PayeeTotal = Ranked<string> & { payee: string; count: number };

/** Biggest payees, grouping spellings like "TIM HORTONS #1234" and "Tim Hortons". */
export function topPayees(rows: readonly ReportTransaction[], limit = 10): PayeeTotal[] {
  const names = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!isSpending(row)) continue;
    const key = payeeCategoryKey(row.payee) || row.payee.toLowerCase();
    if (!names.has(key)) names.set(key, row.payee);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return rank(totalBy(rows, (r) => payeeCategoryKey(r.payee) || r.payee.toLowerCase()))
    .slice(0, limit)
    .map((r) => ({ ...r, payee: names.get(r.key)!, count: counts.get(r.key)! }));
}

export type MonthTotal = { month: string; cents: number };

/** Net spending for each of the `months` months ending with `endDate`'s month, oldest first. */
export function spendingByMonth(
  rows: readonly ReportTransaction[],
  endDate: string,
  months = 12,
): MonthTotal[] {
  const last = startOfMonth(parseISODate(endDate));
  const keys = Array.from({ length: months }, (_, i) =>
    format(addMonths(last, i - months + 1), 'yyyy-MM'),
  );
  const totals = totalBy(rows, (r) => r.date.slice(0, 7));
  return keys.map((month) => {
    const cents = totals.get(month) ?? 0;
    return { month, cents: cents === 0 ? 0 : cents };
  });
}

/** The first and last day of the 12-month window `spendingByMonth` covers. */
export function monthWindow(endDate: string, months = 12): { from: string; to: string } {
  const last = startOfMonth(parseISODate(endDate));
  return {
    from: format(addMonths(last, 1 - months), 'yyyy-MM-dd'),
    to: format(endOfMonth(last), 'yyyy-MM-dd'),
  };
}

/** Keep the `limit` largest rows and fold the rest into one "other" row (null when none). */
export function foldTail<K>(
  ranked: readonly Ranked<K>[],
  limit: number,
): { shown: Ranked<K>[]; other: { cents: number; share: number; count: number } | null } {
  if (ranked.length <= limit) return { shown: [...ranked], other: null };
  const tail = ranked.slice(limit);
  return {
    shown: ranked.slice(0, limit),
    other: {
      cents: tail.reduce((s, r) => s + r.cents, 0),
      share: tail.reduce((s, r) => s + r.share, 0),
      count: tail.length,
    },
  };
}

export type DateRange = { from: string; to: string };

/**
 * The period to compare a report range with, or null for "all time". Ranges are first cut at
 * today (a month isn't over yet). A range that starts on the 1st is compared with the same days
 * of the month before (Oct 1–15 with Sep 1–15); one that starts on January 1st with the same
 * stretch a year earlier; any other range with the same number of days just before it.
 */
export function comparisonRanges(
  range: { from?: string; to?: string },
  today: string,
): { current: DateRange; previous: DateRange } | null {
  if (!range.from) return null;
  const to = range.to && range.to < today ? range.to : today;
  const current = { from: range.from, to };
  const start = parseISODate(range.from);
  if (start.getDate() === 1) {
    const end = parseISODate(to);
    const span =
      (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
    // The year so far is compared with the same months last year.
    const months = start.getMonth() === 0 ? Math.max(12, span) : span;
    const previousStart = addMonths(start, -months);
    // Same day of the month, but never past the end of that (possibly shorter) month.
    const shifted = addMonths(end, -months);
    const lastOfMonth = endOfMonth(addMonths(previousStart, span - 1));
    return {
      current,
      previous: {
        from: format(previousStart, 'yyyy-MM-dd'),
        to: format(shifted > lastOfMonth ? lastOfMonth : shifted, 'yyyy-MM-dd'),
      },
    };
  }
  const days = differenceInCalendarDays(parseISODate(to), start) + 1;
  return {
    current,
    previous: {
      from: format(addDays(start, -days), 'yyyy-MM-dd'),
      to: format(addDays(start, -1), 'yyyy-MM-dd'),
    },
  };
}

export type RankedChange<K> = Ranked<K> & { previousCents: number; changeCents: number };

/** Each current row with what the same key came to in the previous period. */
export function withChanges<K>(
  current: readonly Ranked<K>[],
  previous: readonly Ranked<K>[],
): RankedChange<K>[] {
  const before = new Map(previous.map((r) => [r.key, r.cents]));
  return current.map((r) => {
    const previousCents = before.get(r.key) ?? 0;
    return { ...r, previousCents, changeCents: r.cents - previousCents };
  });
}

/**
 * The keys whose spending moved the most between two periods (either way), biggest first,
 * including ones that dropped to nothing. Small wobbles (under `minimumCents`) are ignored.
 */
export function biggestChanges<K>(
  current: readonly Ranked<K>[],
  previous: readonly Ranked<K>[],
  { limit = 2, minimumCents = 1000 } = {},
): { key: K; changeCents: number }[] {
  const keys = new Set([...current.map((r) => r.key), ...previous.map((r) => r.key)]);
  const now = new Map(current.map((r) => [r.key, r.cents]));
  const before = new Map(previous.map((r) => [r.key, r.cents]));
  return [...keys]
    .map((key) => ({ key, changeCents: (now.get(key) ?? 0) - (before.get(key) ?? 0) }))
    .filter((c) => Math.abs(c.changeCents) >= minimumCents)
    .sort((a, b) => Math.abs(b.changeCents) - Math.abs(a.changeCents))
    .slice(0, limit);
}

/**
 * Average monthly spending over the complete months in a `spendingByMonth` series (the last
 * month is still in progress), starting from the first month with any spending. Null until
 * there's at least one complete month.
 */
export function monthlyAverage(months: readonly MonthTotal[]): number | null {
  const complete = months.slice(0, -1);
  const first = complete.findIndex((m) => m.cents !== 0);
  if (first < 0) return null;
  const counted = complete.slice(first);
  return Math.round(counted.reduce((s, m) => s + m.cents, 0) / counted.length);
}
