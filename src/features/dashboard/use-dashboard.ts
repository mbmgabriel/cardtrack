import { repos } from '@/db';
import { useLiveData } from '@/db/live';
import { monthRanges } from '@/domain/dashboard';
import { withSummaries } from '@/features/accounts/account-summaries';

import { dashboardView, type DashboardInput } from './dashboard-data';

/** Transactions shown under "Recent activity". */
export const RECENT_LIMIT = 5;

/**
 * Everything the dashboard shows, recomputed whenever accounts, transactions or rules change:
 * one view for all cards together and one per card, so swiping the wallet just picks a view.
 */
export function useDashboard(today: string) {
  return useLiveData(() => {
    const items = withSummaries(repos.accounts.list(), repos.transactions.totalsByAccount());
    const ranges = monthRanges(today);
    const input: DashboardInput = {
      items,
      rules: repos.recurring.listActive(),
      installments: repos.installments.list(),
      today,
      spending: {
        thisMonth: repos.transactions.spendingByAccount(ranges.thisMonth),
        lastMonthToDate: repos.transactions.spendingByAccount(ranges.lastMonthToDate),
        lastMonth: repos.transactions.spendingByAccount(ranges.lastMonth),
      },
    };
    const recent = (accountIds: string[]) =>
      accountIds.length > 0 ? repos.transactions.search({ accountIds, limit: RECENT_LIMIT }) : [];
    return {
      hideBalances: repos.settings.get('hide_balances'),
      hasAccounts: items.length > 0,
      cards: items,
      all: {
        ...dashboardView(input, null),
        recent: recent(items.map((i) => i.account.id)),
      },
      byCard: new Map(
        items.map((i) => [
          i.account.id,
          { ...dashboardView(input, i.account.id), recent: recent([i.account.id]) },
        ]),
      ),
    };
  }, ['accounts', 'transactions', 'recurring_rules', 'installment_plans', 'settings']);
}

/** Remember whether the dashboard hides amounts. */
export function setHideBalances(hidden: boolean) {
  repos.settings.set('hide_balances', hidden);
}
