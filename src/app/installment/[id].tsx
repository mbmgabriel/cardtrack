import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { ListRow, Panel } from '@/components/page-kit';
import { repos } from '@/db';
import { useLiveData } from '@/db/live';
import { useAccount } from '@/features/accounts/use-accounts';
import { InstallmentForm } from '@/features/installments/installment-form';
import {
  installmentToFormValues,
  toInstallmentInput,
  type InstallmentFormValues,
} from '@/features/installments/installment-form-schema';
import { useLocale } from '@/i18n/use-locale';

/** Edit or delete an instalment plan. */
export default function EditInstallmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const locale = useLocale();
  const plan = useLiveData(() => repos.installments.getById(id), ['installment_plans']);
  const item = useAccount(plan?.accountId ?? '');

  if (!plan || !item) {
    return <EmptyState icon="credit-card-off-outline" message={t('installments.notFound')} />;
  }

  const save = (values: InstallmentFormValues) => {
    try {
      repos.installments.update(id, toInstallmentInput(values, plan.accountId, locale));
      router.back();
    } catch (e) {
      Alert.alert(t('common.saveFailed'), e instanceof Error ? e.message : String(e));
    }
  };

  const remove = () =>
    Alert.alert(
      t('installments.deleteTitle', { name: plan.description }),
      t('installments.deleteBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            repos.installments.delete(id);
            router.back();
          },
        },
      ],
    );

  return (
    <>
      <Stack.Screen options={{ title: t('installmentForm.editTitle') }} />
      <InstallmentForm
        key={plan.updatedAt}
        defaultValues={installmentToFormValues(plan, locale)}
        currency={item.account.currency}
        submitLabel={t('common.save')}
        onSubmit={save}
        footer={
          <Panel padded={false}>
            <ListRow
              icon="delete-outline"
              title={t('installments.delete')}
              destructive
              onPress={remove}
            />
          </Panel>
        }
      />
    </>
  );
}
