import { repos } from '@/db';
import { useLiveData } from '@/db/live';

import { withSummaries, type AccountWithSummary } from './account-summaries';

/** Accounts in display order with live balances; updates on any account or transaction change. */
export function useAccounts({ includeArchived = false } = {}): AccountWithSummary[] {
  return useLiveData(
    () =>
      withSummaries(repos.accounts.list({ includeArchived }), repos.transactions.totalsByAccount()),
    ['accounts', 'transactions'],
  );
}

export function useAccount(id: string): AccountWithSummary | undefined {
  return useLiveData(() => {
    const account = repos.accounts.getById(id);
    return account ? withSummaries([account], repos.transactions.totalsByAccount())[0] : undefined;
  }, ['accounts', 'transactions']);
}
