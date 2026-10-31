import type { Account } from '@/db/schema';
import { summarizeAccount, type AccountSummary, type TransactionTotals } from '@/domain/balances';

export type AccountWithSummary = { account: Account; summary: AccountSummary };

const NO_TRANSACTIONS: TransactionTotals = { postedCents: 0, pendingCents: 0 };

/** Pair each account with its balance summary; accounts without transactions get zero totals. */
export function withSummaries(
  accounts: readonly Account[],
  totals: ReadonlyMap<string, TransactionTotals>,
): AccountWithSummary[] {
  return accounts.map((account) => ({
    account,
    summary: summarizeAccount(account, totals.get(account.id) ?? NO_TRANSACTIONS),
  }));
}
