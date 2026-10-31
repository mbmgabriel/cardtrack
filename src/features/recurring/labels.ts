import type { TFunction } from 'i18next';

import type { RecurringRule } from '@/db/schema';
import type { RecurringFrequency } from '@/domain/types';

const UNITS: Record<RecurringFrequency, { unit: 'weeks' | 'months' | 'years'; per: number }> = {
  weekly: { unit: 'weeks', per: 1 },
  biweekly: { unit: 'weeks', per: 2 },
  monthly: { unit: 'months', per: 1 },
  quarterly: { unit: 'months', per: 3 },
  yearly: { unit: 'years', per: 1 },
};

/** "Monthly", "Every 2 weeks", "Every 6 months" (quarterly every 2), … */
export function frequencyLabel(
  rule: Pick<RecurringRule, 'frequency' | 'interval'>,
  t: TFunction,
): string {
  if (rule.interval === 1) return t(`frequencies.${rule.frequency}`);
  const { unit, per } = UNITS[rule.frequency];
  return t(`frequencyEvery.${unit}`, { count: per * rule.interval });
}
