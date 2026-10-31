import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { repos } from '@/db';
import { todayISO } from '@/domain/dates';
import { AccountStepper } from '@/features/accounts/account-stepper';
import {
  defaultAccountFormValues,
  toAccountInput,
  type AccountFormValues,
} from '@/features/accounts/account-form-schema';
import { useLocale } from '@/i18n/use-locale';
import { runDailyJobs } from '@/features/background/daily-jobs';

export default function NewAccountScreen() {
  const { t } = useTranslation();
  const locale = useLocale();
  const defaults = defaultAccountFormValues({
    currency: repos.settings.get('currency_default'),
    today: todayISO(),
  });

  /** Save; whether it worked decides if the flow shows "Account added" and closes. */
  const save = (values: AccountFormValues): boolean => {
    try {
      repos.accounts.create(toAccountInput(values, locale));
      runDailyJobs();
      return true;
    } catch (e) {
      Alert.alert(t('common.saveFailed'), e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: t('accountForm.newTitle'), presentation: 'modal' }} />
      <AccountStepper defaultValues={defaults} onSubmit={save} onDone={() => router.back()} />
    </>
  );
}
