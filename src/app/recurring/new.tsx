import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { repos } from '@/db';
import { todayISO } from '@/domain/dates';
import { useCategories } from '@/features/categories/use-categories';
import { RecurringStepper } from '@/features/recurring/recurring-stepper';
import {
  defaultRecurringFormValues,
  suggestionToFormValues,
  toRecurringRuleInput,
  type RecurringFormValues,
} from '@/features/recurring/recurring-form-schema';
import { runDailyJobs } from '@/features/background/daily-jobs';
import { useFormAccounts } from '@/features/transactions/use-transactions';
import { useLocale } from '@/i18n/use-locale';

/** From a "Looks recurring" suggestion: payee, amountCents, anchorDate, categoryId. */
type Params = {
  accountId?: string;
  payee?: string;
  amountCents?: string;
  anchorDate?: string;
  categoryId?: string;
};

export default function NewRecurringScreen() {
  const { accountId, payee, amountCents, anchorDate, categoryId } = useLocalSearchParams<Params>();
  const { t } = useTranslation();
  const locale = useLocale();
  const accounts = useFormAccounts(accountId);
  const categories = useCategories();
  const today = todayISO();
  const account = accountId ?? accounts[0]?.id ?? '';

  const defaults =
    payee && amountCents && anchorDate
      ? suggestionToFormValues(
          {
            accountId: account,
            payee,
            amountCents: Number(amountCents),
            anchorDate,
            categoryId: categoryId || null,
          },
          locale,
          today,
        )
      : defaultRecurringFormValues({ accountId: account, today });

  if (accounts.length === 0) {
    return <EmptyState icon="credit-card-plus-outline" message={t('empty.accounts')} />;
  }

  /** Save; whether it worked decides if the flow shows "Saved" and closes. */
  const save = (values: RecurringFormValues): boolean => {
    try {
      repos.recurring.create(toRecurringRuleInput(values, locale, today));
      // A charge due today is added straight away.
      runDailyJobs();
      return true;
    } catch (e) {
      Alert.alert(t('common.saveFailed'), e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: t('recurringForm.newTitle'), presentation: 'modal' }} />
      <RecurringStepper
        defaultValues={defaults}
        accounts={accounts}
        categories={categories}
        onSubmit={save}
        onDone={() => router.back()}
      />
    </>
  );
}
