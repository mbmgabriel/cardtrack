import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { repos } from '@/db';
import { todayISO } from '@/domain/dates';
import { useAccount } from '@/features/accounts/use-accounts';
import { InstallmentForm } from '@/features/installments/installment-form';
import {
  defaultInstallmentFormValues,
  toInstallmentInput,
  type InstallmentFormValues,
} from '@/features/installments/installment-form-schema';
import { useLocale } from '@/i18n/use-locale';

/** Add an instalment plan to a card (`?accountId=`). */
export default function NewInstallmentScreen() {
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const { t } = useTranslation();
  const locale = useLocale();
  const item = useAccount(accountId);

  if (!item) return <EmptyState icon="credit-card-off-outline" message={t('accounts.notFound')} />;

  const save = (values: InstallmentFormValues) => {
    try {
      repos.installments.create(toInstallmentInput(values, accountId, locale));
      router.back();
    } catch (e) {
      Alert.alert(t('common.saveFailed'), e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t('installmentForm.newTitle', { name: item.account.name }),
          presentation: 'modal',
        }}
      />
      <InstallmentForm
        defaultValues={defaultInstallmentFormValues(todayISO())}
        currency={item.account.currency}
        submitLabel={t('installmentForm.save')}
        onSubmit={save}
      />
    </>
  );
}
