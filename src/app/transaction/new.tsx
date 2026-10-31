import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { repos } from '@/db';
import type { Account } from '@/db/schema';
import { todayISO } from '@/domain/dates';
import { centsToInputString } from '@/domain/money';
import { TRANSACTION_TYPES, type TransactionStatus, type TransactionType } from '@/domain/types';
import { useCategories } from '@/features/categories/use-categories';
import { TransactionStepper } from '@/features/transactions/transaction-stepper';
import {
  defaultTransactionFormValues,
  directionForType,
  toNewTransaction,
  transactionToFormValues,
  type TransactionFormValues,
} from '@/features/transactions/transaction-form-schema';
import { useFormAccounts, useTransferPayeeLabels } from '@/features/transactions/use-transactions';
import { useLocale } from '@/i18n/use-locale';
import { newId } from '@/utils/id';
import { runDailyJobs } from '@/features/background/daily-jobs';

type Params = {
  accountId?: string;
  status?: TransactionStatus;
  duplicateOf?: string;
  /** Pre-select a type, e.g. `payment` from a statement's "Record a payment". */
  type?: TransactionType;
  /** Link the new transaction (the side on `accountId`) to this statement. */
  statementId?: string;
  /** Pre-fill the amount, e.g. the balance owed from the dashboard's "Record payment". */
  amountCents?: string;
};

/** Quick-add (PLAN.md §5). `?accountId=` pre-selects the account; `?duplicateOf=` copies one. */
export default function NewTransactionScreen() {
  const { accountId, status, duplicateOf, type, statementId, amountCents } =
    useLocalSearchParams<Params>();
  const { t } = useTranslation();
  const locale = useLocale();
  const accounts = useFormAccounts(accountId);
  const categories = useCategories();
  const labels = useTransferPayeeLabels();

  const source = duplicateOf ? repos.transactions.getById(duplicateOf) : undefined;
  const defaults: TransactionFormValues = source
    ? {
        ...transactionToFormValues(source, locale, repos.transactions.counterpart(source.id)),
        date: todayISO(),
      }
    : withAmount(
        withType(
          defaultTransactionFormValues({
            accountId: accountId ?? accounts[0]?.id ?? '',
            today: todayISO(),
            status: status === 'pending' ? 'pending' : 'posted',
          }),
          type,
          accounts.find((a) => a.id === accountId)?.type,
        ),
        amountCents,
        locale,
      );

  if (accounts.length === 0) {
    return <EmptyState icon="credit-card-plus-outline" message={t('empty.accounts')} />;
  }

  /** Save; whether it worked decides if the flow shows "Saved" and closes. */
  const save = (values: TransactionFormValues): boolean => {
    try {
      const result = toNewTransaction(values, {
        locale,
        accounts: new Map(accounts.map((a) => [a.id, a])),
        labels,
        newGroupId: newId,
      });
      if (result.kind === 'transfer') {
        const [self, other] = result.pair;
        repos.transactions.createTransfer([{ ...self, statementId: statementId ?? null }, other]);
      } else {
        repos.transactions.create({ ...result.input, statementId: statementId ?? null });
      }
      runDailyJobs();
      return true;
    } catch (e) {
      Alert.alert(t('common.saveFailed'), e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: t('transactionForm.newTitle'), presentation: 'modal' }} />
      <TransactionStepper
        defaultValues={defaults}
        accounts={accounts}
        categories={categories}
        onSubmit={save}
        onDone={() => router.back()}
        // A copy already has every answer: open on the review.
        initialStep={source ? 'details' : 'amount'}
      />
    </>
  );
}

/** Apply a `?type=` param, with the direction that type implies on this account. */
function withType(
  values: TransactionFormValues,
  type: string | undefined,
  accountType: Account['type'] | undefined,
): TransactionFormValues {
  if (!type || !(TRANSACTION_TYPES as readonly string[]).includes(type)) return values;
  const t = type as TransactionType;
  return { ...values, type: t, direction: directionForType(t, accountType, values.direction) };
}

/** Apply an `?amountCents=` param; anything but a positive whole number of cents is ignored. */
function withAmount(
  values: TransactionFormValues,
  amountCents: string | undefined,
  locale: string,
): TransactionFormValues {
  const cents = Number(amountCents);
  if (!amountCents || !Number.isSafeInteger(cents) || cents <= 0) return values;
  return { ...values, amount: centsToInputString(cents, locale) };
}
