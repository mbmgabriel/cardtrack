import { repos } from '@/db';
import { useLiveData } from '@/db/live';
import { SPENDING_TYPES } from '@/domain/dashboard';
import {
  monthWindow,
  spendingByAccount,
  spendingByCategory,
  spendingByMonth,
  topPayees,
  totalSpendingCents,
} from '@/domain/reports';

/** No practical cap: reports read every matching row (Phase 10 checks 10k-row performance). */
const ALL = Number.MAX_SAFE_INTEGER;

export type ReportScope = {
  currency: string;
  /** Empty = every account in the currency. */
  accountIds: readonly string[];
  from?: string;
  to?: string;
  /** End of the 12-month chart. */
  monthsEnd: string;
  /** The period to compare with (see `comparisonRanges`), if any. */
  previous?: { from: string; to: string };
};

/** Every report for one currency and date range, recomputed when transactions change. */
export function useReport(scope: ReportScope) {
  return useLiveData(() => {
    const accounts = repos.accounts
      .list({ includeArchived: true })
      .filter((a) => a.currency === scope.currency);
    const ids =
      scope.accountIds.length > 0
        ? accounts.filter((a) => scope.accountIds.includes(a.id)).map((a) => a.id)
        : accounts.map((a) => a.id);
    if (ids.length === 0) return null;
    const base = { accountIds: ids, types: [...SPENDING_TYPES], limit: ALL };
    const rows = repos.transactions.search({ ...base, from: scope.from, to: scope.to });
    const yearRows = repos.transactions.search({ ...base, ...monthWindow(scope.monthsEnd) });
    const previousRows = scope.previous
      ? repos.transactions.search({ ...base, ...scope.previous })
      : null;
    return {
      previous: previousRows
        ? {
            total: totalSpendingCents(previousRows),
            byCategory: spendingByCategory(previousRows),
            byAccount: spendingByAccount(previousRows),
          }
        : null,
      total: totalSpendingCents(rows),
      byCategory: spendingByCategory(rows),
      byAccount: spendingByAccount(rows),
      payees: topPayees(rows),
      months: spendingByMonth(yearRows, scope.monthsEnd),
    };
  }, ['accounts', 'transactions']);
}
