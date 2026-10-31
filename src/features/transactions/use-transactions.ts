import { useTranslation } from 'react-i18next';

import { repos } from '@/db';
import { useLiveData } from '@/db/live';
import type { TransactionFilters } from '@/db/repositories/transactions';
import type { Account, Transaction } from '@/db/schema';

import type { TransferPayeeLabels } from './transaction-form-schema';

export function useAccountTransactions(accountId: string): Transaction[] {
  return useLiveData(() => repos.transactions.listByAccount(accountId), ['transactions']);
}

export function useTransaction(
  id: string,
): { transaction: Transaction; counterpart: Transaction | undefined } | undefined {
  return useLiveData(() => {
    const transaction = repos.transactions.getById(id);
    return transaction
      ? { transaction, counterpart: repos.transactions.counterpart(id) }
      : undefined;
  }, ['transactions']);
}

export function useTransactionSearch(filters: TransactionFilters): Transaction[] {
  return useLiveData(() => repos.transactions.search(filters), ['transactions']);
}

/** Every account (archived too) by id, for labelling rows. */
export function useAccountMap(): Map<string, Account> {
  return useLiveData(
    () => new Map(repos.accounts.list({ includeArchived: true }).map((a) => [a.id, a])),
    ['accounts'],
  );
}

/** Accounts offered in the transaction form: active ones, plus `keepId` if it is archived. */
export function useFormAccounts(keepId?: string): Account[] {
  return useLiveData(
    () =>
      repos.accounts
        .list({ includeArchived: true })
        .filter((a) => !a.isArchived || a.id === keepId),
    ['accounts'],
  );
}

export function useTransferPayeeLabels(): TransferPayeeLabels {
  const { t } = useTranslation();
  return {
    to: (name, isPayment) =>
      t(isPayment ? 'transactionForm.paymentTo' : 'transactionForm.transferTo', { name }),
    from: (name, isPayment) =>
      t(isPayment ? 'transactionForm.paymentFrom' : 'transactionForm.transferFrom', { name }),
  };
}
