/** Turns accounts, recurring rules and spending totals into what the dashboard shows. */
import type { Account, InstallmentPlan, RecurringRule } from '@/db/schema';
import { daysUntil, dueUrgency, percentChange, type DueUrgency } from '@/domain/dashboard';
import { addDaysISO, DEFAULT_DUE_DAY_OFFSET, nextDueDate } from '@/domain/dates';
import { upcomingInstallments as installmentsDue } from '@/domain/installments';
import { monthlyEquivalentCents, nextOccurrences } from '@/domain/recurrence';
import type { AccountWithSummary } from '@/features/accounts/account-summaries';

export type CurrencySummary = {
  currency: string;
  owedCents: number;
  cashCents: number;
  pendingHoldsCents: number;
  /** Only accounts with a credit limit contribute to available credit and utilization. */
  availableCreditCents: number;
  creditLimitCents: number;
  utilization: number | null;
  hasLiability: boolean;
  hasCash: boolean;
};

/** Totals grouped per currency — no FX conversion in v1 (PLAN.md §7). */
export function summarizeByCurrency(items: readonly AccountWithSummary[]): CurrencySummary[] {
  const byCurrency = new Map<string, CurrencySummary & { limitedOwedCents: number }>();
  for (const { account, summary } of items) {
    let entry = byCurrency.get(account.currency);
    if (!entry) {
      entry = {
        currency: account.currency,
        owedCents: 0,
        cashCents: 0,
        pendingHoldsCents: 0,
        availableCreditCents: 0,
        creditLimitCents: 0,
        utilization: null,
        hasLiability: false,
        hasCash: false,
        limitedOwedCents: 0,
      };
      byCurrency.set(account.currency, entry);
    }
    entry.pendingHoldsCents += summary.pendingHoldsCents;
    if (summary.isLiability) {
      entry.hasLiability = true;
      entry.owedCents += summary.balanceCents;
      if (account.creditLimitCents != null && account.creditLimitCents > 0) {
        entry.creditLimitCents += account.creditLimitCents;
        entry.availableCreditCents += summary.availableCreditCents ?? 0;
        entry.limitedOwedCents += Math.max(0, summary.balanceCents);
      }
    } else {
      entry.hasCash = true;
      entry.cashCents += summary.balanceCents;
    }
  }
  return [...byCurrency.values()]
    .map(({ limitedOwedCents, ...entry }) => ({
      ...entry,
      utilization: entry.creditLimitCents > 0 ? limitedOwedCents / entry.creditLimitCents : null,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export type UpcomingDue = {
  account: Account;
  owedCents: number;
  dueDate: string;
  statementEnd: string;
  daysUntil: number;
  urgency: DueUrgency;
};

/** The next payment due on each credit card / LOC with a statement day, soonest first. */
export function upcomingDueDates(
  items: readonly AccountWithSummary[],
  today: string,
  limit = 3,
): UpcomingDue[] {
  return items
    .filter(({ account, summary }) => summary.isLiability && account.statementDay != null)
    .map(({ account, summary }) => {
      const due = nextDueDate(
        today,
        account.statementDay!,
        account.dueDayOffset ?? DEFAULT_DUE_DAY_OFFSET,
      );
      const days = daysUntil(due.dueDate, today);
      return {
        account,
        owedCents: summary.balanceCents,
        dueDate: due.dueDate,
        statementEnd: due.period.end,
        daysUntil: days,
        urgency: dueUrgency(days),
      };
    })
    .sort(
      (a, b) => a.dueDate.localeCompare(b.dueDate) || a.account.name.localeCompare(b.account.name),
    )
    .slice(0, limit);
}

export type UpcomingCharge = {
  rule: RecurringRule;
  account: Account;
  date: string;
  daysUntil: number;
};

export const UPCOMING_RECURRING_DAYS = 14;

/** Rules that count: active, on an account that still exists and isn't archived. */
function liveRules(
  rules: readonly RecurringRule[],
  accounts: ReadonlyMap<string, Account>,
): { rule: RecurringRule; account: Account }[] {
  return rules.flatMap((rule) => {
    const account = accounts.get(rule.accountId);
    return rule.isActive && account && !account.isArchived ? [{ rule, account }] : [];
  });
}

/** Every recurring charge in the next `days` days (a weekly rule appears twice), soonest first. */
export function upcomingRecurring(
  rules: readonly RecurringRule[],
  accounts: ReadonlyMap<string, Account>,
  today: string,
  days = UPCOMING_RECURRING_DAYS,
): UpcomingCharge[] {
  return liveRules(rules, accounts)
    .flatMap(({ rule, account }) =>
      nextOccurrences(rule, today, addDaysISO(today, days)).map((date) => ({
        rule,
        account,
        date,
        daysUntil: daysUntil(date, today),
      })),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.rule.payee.localeCompare(b.rule.payee));
}

/** What recurring charges (money out) cost per month, per currency, as positive amounts. */
export function monthlyRecurringByCurrency(
  rules: readonly RecurringRule[],
  accounts: ReadonlyMap<string, Account>,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const { rule, account } of liveRules(rules, accounts)) {
    if (rule.amountCents >= 0) continue;
    const monthly = -monthlyEquivalentCents(rule);
    totals.set(account.currency, (totals.get(account.currency) ?? 0) + monthly);
  }
  return totals;
}

export type SpendingComparison = {
  currency: string;
  thisMonthCents: number;
  lastMonthToDateCents: number;
  lastMonthCents: number;
  /** This month so far vs the same days last month. */
  change: number | null;
};

export function compareSpending(
  thisMonth: ReadonlyMap<string, number>,
  lastMonthToDate: ReadonlyMap<string, number>,
  lastMonth: ReadonlyMap<string, number>,
): SpendingComparison[] {
  const currencies = new Set([...thisMonth.keys(), ...lastMonth.keys()]);
  return [...currencies].sort().map((currency) => {
    const current = thisMonth.get(currency) ?? 0;
    const previous = lastMonthToDate.get(currency) ?? 0;
    return {
      currency,
      thisMonthCents: current,
      lastMonthToDateCents: previous,
      lastMonthCents: lastMonth.get(currency) ?? 0,
      change: percentChange(current, previous),
    };
  });
}

/** One instalment of a plan on a card, coming up. */
export type UpcomingInstallment = {
  plan: InstallmentPlan;
  account: Account;
  date: string;
  /** 1-based, e.g. 5 of 12. */
  number: number;
  amountCents: number;
  daysUntil: number;
};

export type TimelineItem =
  | { kind: 'due'; key: string; date: string; due: UpcomingDue }
  | { kind: 'charge'; key: string; date: string; charge: UpcomingCharge }
  | { kind: 'installment'; key: string; date: string; installment: UpcomingInstallment };

export type TimelineDay = { date: string; items: TimelineItem[] };

/**
 * "Coming up": payment due dates and recurring charges on one timeline, grouped by day,
 * soonest first. Within a day, payments due come before charges.
 */
export function buildTimeline(
  dues: readonly UpcomingDue[],
  charges: readonly UpcomingCharge[],
  installments: readonly UpcomingInstallment[] = [],
): TimelineDay[] {
  const items: TimelineItem[] = [
    ...dues.map((due) => ({
      kind: 'due' as const,
      key: `due-${due.account.id}-${due.dueDate}`,
      date: due.dueDate,
      due,
    })),
    ...charges.map((charge) => ({
      kind: 'charge' as const,
      key: `charge-${charge.rule.id}-${charge.date}`,
      date: charge.date,
      charge,
    })),
    ...installments.map((installment) => ({
      kind: 'installment' as const,
      key: `installment-${installment.plan.id}-${installment.date}`,
      date: installment.date,
      installment,
    })),
  ].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.kind === b.kind ? 0 : a.kind === 'due' ? -1 : 1) ||
      a.key.localeCompare(b.key),
  );
  const days: TimelineDay[] = [];
  for (const item of items) {
    const last = days[days.length - 1];
    if (last?.date === item.date) last.items.push(item);
    else days.push({ date: item.date, items: [item] });
  }
  return days;
}

export type SpendingPace = {
  spentCents: number;
  /** Fill of the bar (0–1): spent so far against last month's total (or more, if over). */
  fill: number;
  /** Where last month stood by the same day, on the same scale (0–1). */
  marker: number;
  change: number | null;
};

/** This month's spending against last month, for the pace bar. */
export function spendingPace(s: SpendingComparison): SpendingPace {
  const scale = Math.max(s.lastMonthCents, s.thisMonthCents, 1);
  return {
    spentCents: s.thisMonthCents,
    fill: Math.max(0, s.thisMonthCents) / scale,
    marker: Math.max(0, s.lastMonthToDateCents) / scale,
    change: s.change,
  };
}

/** Spending per account id for the three ranges the pace card compares. */
export type AccountSpending = {
  thisMonth: ReadonlyMap<string, number>;
  lastMonthToDate: ReadonlyMap<string, number>;
  lastMonth: ReadonlyMap<string, number>;
};

export type DashboardInput = {
  items: readonly AccountWithSummary[];
  rules: readonly RecurringRule[];
  /** Instalment plans on cards; their next instalments join "Coming up". */
  installments?: readonly InstallmentPlan[];
  spending: AccountSpending;
  today: string;
};

/** Everything below the wallet, for one focus: all cards together or a single card. */
export type DashboardView = {
  timeline: TimelineDay[];
  totals: CurrencySummary[];
  monthlyRecurring: Map<string, number>;
  spending: SpendingComparison[];
};

/** Add up per-account amounts by currency, keeping only the accounts in `scope`. */
function byCurrency(
  perAccount: ReadonlyMap<string, number>,
  scope: ReadonlyMap<string, Account>,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const [id, cents] of perAccount) {
    const account = scope.get(id);
    if (account) totals.set(account.currency, (totals.get(account.currency) ?? 0) + cents);
  }
  return totals;
}

/**
 * The dashboard scoped to one card (`accountId`) or to every card (`null`). The wallet's focused
 * card picks which one is shown, so everything under it follows the card the user is looking at.
 */
export function dashboardView(input: DashboardInput, accountId: string | null): DashboardView {
  const items = accountId ? input.items.filter((i) => i.account.id === accountId) : input.items;
  const scope = new Map(items.map((i) => [i.account.id, i.account]));
  const rules = input.rules.filter((r) => scope.has(r.accountId));
  return {
    timeline: buildTimeline(
      upcomingDueDates(items, input.today),
      upcomingRecurring(rules, scope, input.today),
      installmentsDue(
        (input.installments ?? []).filter((p) => scope.has(p.accountId)),
        input.today,
        UPCOMING_RECURRING_DAYS,
      ).map((u) => ({ ...u, account: scope.get(u.plan.accountId)! })),
    ),
    totals: summarizeByCurrency(items),
    monthlyRecurring: monthlyRecurringByCurrency(rules, scope),
    spending: compareSpending(
      byCurrency(input.spending.thisMonth, scope),
      byCurrency(input.spending.lastMonthToDate, scope),
      byCurrency(input.spending.lastMonth, scope),
    ),
  };
}
