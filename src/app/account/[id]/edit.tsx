import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Dialog, Portal, Text, useTheme } from 'react-native-paper';

import { EmptyState } from '@/components/empty-state';
import { repos } from '@/db';
import { deleteCardArt } from '@/features/card-art/card-art';
import { AccountForm } from '@/features/accounts/account-form';
import {
  accountToFormValues,
  toAccountInput,
  type AccountFormValues,
} from '@/features/accounts/account-form-schema';
import { useAccount } from '@/features/accounts/use-accounts';
import { useLocale } from '@/i18n/use-locale';
import { runDailyJobs } from '@/features/background/daily-jobs';

export default function EditAccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const current = useAccount(id);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!current)
    return <EmptyState icon="credit-card-off-outline" message={t('accounts.notFound')} />;
  const { account } = current;
  const transactionCount = confirmDelete ? repos.accounts.countTransactions(id) : 0;

  const save = (values: AccountFormValues) => {
    try {
      repos.accounts.update(id, toAccountInput(values, locale));
      runDailyJobs();
      router.back();
    } catch (e) {
      Alert.alert(t('common.saveFailed'), e instanceof Error ? e.message : String(e));
    }
  };

  const toggleArchived = () => {
    repos.accounts.setArchived(id, !account.isArchived);
    router.back();
  };

  const remove = () => {
    setConfirmDelete(false);
    repos.accounts.delete(id);
    // Its custom artwork goes with it.
    deleteCardArt(account.imagePath);
    router.dismissAll();
  };

  return (
    <>
      <Stack.Screen options={{ title: t('accountForm.editTitle') }} />
      <AccountForm
        defaultValues={accountToFormValues(account, locale)}
        submitLabel={t('common.save')}
        onSubmit={save}
        footer={
          <View style={styles.danger}>
            <Button
              mode="outlined"
              icon="archive-outline"
              onPress={toggleArchived}
              contentStyle={styles.button}>
              {account.isArchived ? t('accounts.unarchive') : t('accounts.archive')}
            </Button>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {t('accounts.archiveHelp')}
            </Text>
            <Button
              mode="outlined"
              icon="delete-outline"
              textColor={theme.colors.error}
              style={{ borderColor: theme.colors.error }}
              onPress={() => setConfirmDelete(true)}
              contentStyle={styles.button}>
              {t('accounts.delete')}
            </Button>
          </View>
        }
      />
      <Portal>
        <Dialog visible={confirmDelete} onDismiss={() => setConfirmDelete(false)}>
          <Dialog.Title>{t('accounts.deleteTitle', { name: account.name })}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              {t('accounts.deleteBody', { count: transactionCount })}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmDelete(false)}>{t('common.cancel')}</Button>
            <Button textColor={theme.colors.error} onPress={remove}>
              {t('accounts.deleteConfirm')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  danger: { marginTop: 24, gap: 12 },
  button: { minHeight: 44 },
});
