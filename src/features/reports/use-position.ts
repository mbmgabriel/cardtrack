import { repos } from '@/db';
import { useLiveData } from '@/db/live';
import { netWorth, safeToSpend, SAFE_TO_SPEND_DAYS } from '@/domain/position';
import { withSummaries } from '@/features/accounts/account-summaries';
import { upcomingDueDates, upcomingRecurring } from '@/features/dashboard/dashboard-data';

/** Net worth and safe-to-spend as of `today`, recomputed when accounts, money or rules change. */
export function usePosition(today: string) {
  return useLiveData(() => {
    const items = withSummaries(repos.accounts.list(), repos.transactions.totalsByAccount());
    const accounts = items.map(({ account, summary }) => ({
      type: account.type,
      currency: account.currency,
      isArchived: account.isArchived,
      balanceCents: summary.balanceCents,
      availableCreditCents: summary.availableCreditCents,
    }));
    const dues = upcomingDueDates(items, today, Number.MAX_SAFE_INTEGER).map((d) => ({
      currency: d.account.currency,
      owedCents: d.owedCents,
      daysUntil: d.daysUntil,
    }));
    const bills = upcomingRecurring(
      repos.recurring.listActive(),
      new Map(items.map((i) => [i.account.id, i.account])),
      today,
      SAFE_TO_SPEND_DAYS,
    ).map((c) => ({
      currency: c.account.currency,
      amountCents: c.rule.amountCents,
      accountType: c.account.type,
      daysUntil: c.daysUntil,
    }));
    return { netWorth: netWorth(accounts), safeToSpend: safeToSpend(accounts, dues, bills) };
  }, ['accounts', 'transactions', 'recurring_rules']);
}
