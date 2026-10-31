/**
 * Bridges the reminder plan to expo-notifications (local only — nothing leaves the device).
 * Every run replaces all scheduled notifications with the current plan.
 */
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Platform } from 'react-native';

import { parseISODate } from '@/domain/dates';
import { formatCents } from '@/domain/money';
import type { PlannedReminder } from '@/domain/reminders';
import i18n from '@/i18n';

export const REMINDER_CHANNEL_ID = 'reminders';

// Show reminders as a banner even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Android needs a channel before it shows the permission prompt or any notification. */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: i18n.t('reminders.channel'),
    importance: AndroidImportance.DEFAULT,
  });
}

function isAllowed(p: Notifications.NotificationPermissionsStatus): boolean {
  return (
    p.granted ||
    p.ios?.status === IosAuthorizationStatus.PROVISIONAL ||
    p.ios?.status === IosAuthorizationStatus.EPHEMERAL
  );
}

export async function hasReminderPermission(): Promise<boolean> {
  return isAllowed(await Notifications.getPermissionsAsync());
}

/** Ask once; returns whether reminders can be shown. */
export async function requestReminderPermission(): Promise<boolean> {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (isAllowed(current)) return true;
  if (!current.canAskAgain) return false;
  return isAllowed(await Notifications.requestPermissionsAsync());
}

export function reminderContent(r: PlannedReminder, locale: string) {
  const t = i18n.t.bind(i18n);
  const date = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(
    parseISODate(r.kind === 'due' ? r.source.dueDate : r.source.date),
  );
  if (r.kind === 'due') {
    const { accountName, amountCents, currency } = r.source;
    const title =
      r.daysBefore === 0
        ? t('reminders.dueToday', { name: accountName })
        : t('reminders.dueSoon', { name: accountName, count: r.daysBefore });
    const body =
      amountCents == null
        ? t('reminders.dueBodyNoAmount', { date })
        : t('reminders.dueBody', { amount: formatCents(amountCents, currency, locale), date });
    return { title, body, data: { url: `/statement/${r.source.statementId}` } };
  }
  const { payee, accountName, amountCents, currency } = r.source;
  const amount = formatCents(Math.abs(amountCents), currency, locale);
  return {
    title:
      r.daysBefore === 0
        ? t('reminders.chargeToday', { payee, amount })
        : t('reminders.chargeSoon', { payee, amount, count: r.daysBefore }),
    body: t('reminders.chargeBody', { name: accountName, date }),
    data: { url: '/(tabs)' },
  };
}

let queue: Promise<void> = Promise.resolve();

/** Replace every scheduled reminder with `plan` (runs are queued so they never interleave). */
export function applyReminders(plan: readonly PlannedReminder[], hour: number, locale: string) {
  queue = queue
    .then(async () => {
      await Notifications.cancelAllScheduledNotificationsAsync();
      if (plan.length === 0 || !(await hasReminderPermission())) return;
      await ensureChannel();
      for (const r of plan) {
        const fire = parseISODate(r.fireDate);
        fire.setHours(hour, 0, 0, 0);
        await Notifications.scheduleNotificationAsync({
          identifier: r.id,
          content: reminderContent(r, locale),
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: fire,
            channelId: REMINDER_CHANNEL_ID,
          },
        });
      }
    })
    .catch((e: unknown) => console.warn('Could not schedule reminders', e));
  return queue;
}

/** A reminder in a few seconds, so people can check notifications work on their phone. */
export async function sendTestReminder(): Promise<boolean> {
  if (!(await requestReminderPermission())) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: i18n.t('reminders.testTitle'), body: i18n.t('reminders.testBody') },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: REMINDER_CHANNEL_ID,
    },
  });
  return true;
}
