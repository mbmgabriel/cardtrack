import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { ListRow, Panel, RowDivider } from '@/components/page-kit';
import { repos } from '@/db';
import { useCategories } from '@/features/categories/use-categories';
import { useTransactionActions } from '@/features/transactions/transaction-actions';
import { TransactionForm } from '@/features/transactions/transaction-form';
import {
  toTransactionPatch,
  transactionToFormValues,
  type TransactionFormValues,
} from '@/features/transactions/transaction-form-schema';
import { useFormAccounts, useTransaction } from '@/features/transactions/use-transactions';
import { useLocale } from '@/i18n/use-locale';
import { runDailyJobs } from '@/features/background/daily-jobs';

export default function EditTransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const locale = useLocale();
  const current = useTransaction(id);
  const accounts = useFormAccounts(current?.transaction.accountId);
  const categories = useCategories();
  const { dialogs, requestDelete, requestMarkPosted } = useTransactionActions({
    onDeleted: () => router.back(),
  });

  if (!current) {
    return <EmptyState icon="receipt-text-remove-outline" message={t('transactions.notFound')} />;
  }
  const { transaction, counterpart } = current;
  const linkedAccount = counterpart ? repos.accounts.getById(counterpart.accountId) : undefined;

  const save = (values: TransactionFormValues) => {
    try {
      repos.transactions.update(id, toTransactionPatch(values, transaction, locale));
      runDailyJobs();
      router.back();
    } catch (e) {
      Alert.alert(t('common.saveFailed'), e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: t('transactionForm.editTitle') }} />
      <TransactionForm
        // Remount when the row changes underneath (e.g. marked posted from the footer).
        key={transaction.updatedAt}
        mode="edit"
        defaultValues={transactionToFormValues(transaction, locale, counterpart)}
        accounts={accounts}
        categories={categories}
        submitLabel={t('common.save')}
        onSubmit={save}
        linkedAccountName={linkedAccount?.name}
        footer={
          <Panel title={t('transactions.actions')} padded={false}>
            {transaction.status === 'pending' ? (
              <>
                <ListRow
                  icon="check-circle-outline"
                  title={t('transactions.markPosted')}
                  onPress={() => requestMarkPosted(transaction)}
                />
                <RowDivider />
              </>
            ) : null}
            {transaction.status !== 'void' ? (
              <>
                <ListRow
                  icon="cancel"
                  title={t('transactions.void')}
                  description={t('transactions.voidHelp')}
                  onPress={() => repos.transactions.void(id)}
                />
                <RowDivider />
              </>
            ) : null}
            <ListRow
              icon="content-copy"
              title={t('transactions.duplicate')}
              onPress={() =>
                router.replace({ pathname: '/transaction/new', params: { duplicateOf: id } })
              }
            />
            <RowDivider />
            <ListRow
              icon="delete-outline"
              title={t('common.delete')}
              destructive
              onPress={() => requestDelete(transaction)}
            />
          </Panel>
        }
      />
      {dialogs}
    </>
  );
}
