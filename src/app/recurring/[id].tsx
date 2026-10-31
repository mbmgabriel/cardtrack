import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet } from 'react-native';
import { Button, Dialog, Portal, Text, useTheme } from 'react-native-paper';

import { EmptyState } from '@/components/empty-state';
import { repos } from '@/db';
import { todayISO } from '@/domain/dates';
import { useCategories } from '@/features/categories/use-categories';
import { RecurringForm } from '@/features/recurring/recurring-form';
import {
  ruleToFormValues,
  toRecurringRuleInput,
  type RecurringFormValues,
} from '@/features/recurring/recurring-form-schema';
import { runDailyJobs } from '@/features/background/daily-jobs';
import { useRule } from '@/features/recurring/use-recurring';
import { useFormAccounts } from '@/features/transactions/use-transactions';
import { useLocale } from '@/i18n/use-locale';

export default function EditRecurringScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const rule = useRule(id);
  const accounts = useFormAccounts(rule?.accountId);
  const categories = useCategories();
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!rule) return <EmptyState icon="autorenew-off" message={t('recurring.notFound')} />;

  const save = (values: RecurringFormValues) => {
    try {
      repos.recurring.update(id, toRecurringRuleInput(values, locale, todayISO()));
      runDailyJobs();
      router.back();
    } catch (e) {
      Alert.alert(t('common.saveFailed'), e instanceof Error ? e.message : String(e));
    }
  };

  const remove = () => {
    setConfirmDelete(false);
    repos.recurring.delete(id);
    router.back();
  };

  return (
    <>
      <Stack.Screen options={{ title: t('recurringForm.editTitle') }} />
      <RecurringForm
        mode="edit"
        defaultValues={ruleToFormValues(rule, locale)}
        accounts={accounts}
        categories={categories}
        submitLabel={t('common.save')}
        onSubmit={save}
        footer={
          <Button
            mode="outlined"
            icon="delete-outline"
            textColor={theme.colors.error}
            style={[styles.delete, { borderColor: theme.colors.error }]}
            contentStyle={styles.button}
            onPress={() => setConfirmDelete(true)}>
            {t('common.delete')}
          </Button>
        }
      />
      <Portal>
        <Dialog visible={confirmDelete} onDismiss={() => setConfirmDelete(false)}>
          <Dialog.Title>{t('recurring.deleteTitle', { payee: rule.payee })}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">{t('recurring.deleteBody')}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmDelete(false)}>{t('common.cancel')}</Button>
            <Button textColor={theme.colors.error} onPress={remove}>
              {t('common.delete')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  delete: { marginTop: 24 },
  button: { minHeight: 44 },
});
