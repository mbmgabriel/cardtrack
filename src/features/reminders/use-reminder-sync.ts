import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { repos } from '@/db';
import { useLiveData } from '@/db/live';
import { todayISO } from '@/domain/dates';
import { planReminders } from '@/domain/reminders';
import { useLocale } from '@/i18n/use-locale';

import { reminderSources } from './reminder-sources';
import { applyReminders } from './scheduler';

function localNow() {
  const now = new Date();
  return { date: todayISO(now), minutes: now.getHours() * 60 + now.getMinutes() };
}

/**
 * Keep scheduled reminders in step with the data: whenever accounts, transactions, statements,
 * rules or settings change (or the app returns to the foreground), recompute the plan and, if it
 * changed, reschedule. Tapping a reminder opens its statement.
 */
export function useReminderSync(): void {
  const locale = useLocale();
  const [now, setNow] = useState(localNow);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(localNow());
    });
    return () => subscription.remove();
  }, []);

  const { plan, hour } = useLiveData(() => {
    const settings = repos.settings.getAll();
    const accounts = repos.accounts.list({ includeArchived: true });
    const sources = reminderSources(
      {
        accounts,
        statements: accounts.flatMap((a) => repos.statements.listByAccount(a.id)),
        transactionsByAccount: new Map(
          accounts.map((a) => [a.id, repos.transactions.listByAccount(a.id)]),
        ),
        rules: repos.recurring.listActive(),
      },
      now.date,
    );
    return {
      hour: settings.reminder_hour,
      plan: planReminders(
        sources.dues,
        sources.charges,
        {
          enabled: settings.reminders_enabled,
          dueDaysBefore: settings.reminder_due_days_before,
          recurringEnabled: settings.reminder_recurring_enabled,
          hour: settings.reminder_hour,
        },
        now,
      ),
    };
  }, ['accounts', 'transactions', 'statements', 'recurring_rules', 'settings']);

  // Reschedule only when what would be shown actually changed, not on every data change.
  const planKey = JSON.stringify([hour, locale, plan]);
  useEffect(() => {
    void applyReminders(plan, hour, locale);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- planKey covers plan, hour and locale
  }, [planKey]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string') router.push(url as Href);
    });
    return () => subscription.remove();
  }, []);
}
