/**
 * Which local notifications to schedule (PLAN.md Phase 6): payment due N days before and on the
 * day, and recurring charges `remind_days_before` days ahead. The whole set is recomputed whenever
 * data changes and replaces what was scheduled, so it must be deterministic.
 */
import { addDaysISO } from './dates';

/** iOS keeps at most 64 pending local notifications per app; leave headroom. */
export const MAX_REMINDERS = 60;
/** Only schedule this far ahead; later reminders are added as the days pass. */
export const REMINDER_HORIZON_DAYS = 60;

export type DueSource = {
  statementId: string;
  accountName: string;
  currency: string;
  dueDate: string;
  /** What is left to pay, once the statement has closed; null while the cycle is open. */
  amountCents: number | null;
};

export type ChargeSource = {
  ruleId: string;
  payee: string;
  accountName: string;
  currency: string;
  amountCents: number;
  /** One occurrence date of the rule. */
  date: string;
  remindDaysBefore: number;
};

export type ReminderSettings = {
  enabled: boolean;
  dueDaysBefore: number;
  recurringEnabled: boolean;
  /** Local hour (0–23) reminders fire at. */
  hour: number;
};

export type PlannedReminder =
  | { id: string; kind: 'due'; fireDate: string; daysBefore: number; source: DueSource }
  | { id: string; kind: 'charge'; fireDate: string; daysBefore: number; source: ChargeSource };

/** Local "now": the date and minutes past midnight. */
export type LocalNow = { date: string; minutes: number };

/** Whether a reminder at `hour` on `fireDate` is still in the future. */
function isUpcoming(fireDate: string, hour: number, now: LocalNow): boolean {
  return fireDate > now.date || (fireDate === now.date && now.minutes < hour * 60);
}

export function planReminders(
  dues: readonly DueSource[],
  charges: readonly ChargeSource[],
  settings: ReminderSettings,
  now: LocalNow,
): PlannedReminder[] {
  if (!settings.enabled) return [];
  const horizon = addDaysISO(now.date, REMINDER_HORIZON_DAYS);
  const planned: PlannedReminder[] = [];

  for (const source of dues) {
    // N days before, and on the day itself (once if N is 0).
    for (const daysBefore of new Set([settings.dueDaysBefore, 0])) {
      const fireDate = addDaysISO(source.dueDate, -daysBefore);
      if (fireDate > horizon || !isUpcoming(fireDate, settings.hour, now)) continue;
      planned.push({
        id: `due:${source.statementId}:${daysBefore}`,
        kind: 'due',
        fireDate,
        daysBefore,
        source,
      });
    }
  }

  if (settings.recurringEnabled) {
    for (const source of charges) {
      const fireDate = addDaysISO(source.date, -source.remindDaysBefore);
      if (fireDate > horizon || !isUpcoming(fireDate, settings.hour, now)) continue;
      planned.push({
        id: `charge:${source.ruleId}:${source.date}`,
        kind: 'charge',
        fireDate,
        daysBefore: source.remindDaysBefore,
        source,
      });
    }
  }

  return planned
    .sort((a, b) => a.fireDate.localeCompare(b.fireDate) || a.id.localeCompare(b.id))
    .slice(0, MAX_REMINDERS);
}
