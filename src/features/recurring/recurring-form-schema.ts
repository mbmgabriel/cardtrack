/**
 * Recurring rule form values (what the user typed) and conversion to/from the repository input.
 * Like transactions, the amount is entered as a positive number plus a direction.
 */
import { z } from 'zod';

import type { RecurringRuleInput } from '@/db/repositories/recurring';
import type { RecurringRule } from '@/db/schema';
import { isISODate } from '@/domain/dates';
import { centsToInputString, parseMoneyToCents } from '@/domain/money';
import { firstOccurrenceOnOrAfter, type RecurringSuggestion } from '@/domain/recurrence';
import { directionOf, signedAmountCents, type Direction } from '@/domain/transactions';
import { RECURRING_FREQUENCIES, type RecurringFrequency } from '@/domain/types';

export type RecurringFormValues = {
  payee: string;
  amount: string;
  direction: Direction;
  accountId: string;
  frequency: RecurringFrequency;
  interval: string;
  /** A date the charge happens (usually the last or first one); all others follow from it. */
  anchorDate: string;
  hasEndDate: boolean;
  endDate: string;
  autoCreate: boolean;
  remindDaysBefore: string;
  categoryId: string;
  notes: string;
  isActive: boolean;
};

const E = 'recurringForm.errors.';

function parseWholeNumber(value: string): number | null {
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
}

export function recurringFormSchema(locale: string) {
  return z
    .object({
      payee: z.string().trim().min(1, `${E}payeeRequired`).max(100, `${E}payeeTooLong`),
      amount: z.string(),
      direction: z.enum(['out', 'in']),
      accountId: z.string().min(1, `${E}accountRequired`),
      frequency: z.enum(RECURRING_FREQUENCIES),
      interval: z.string(),
      anchorDate: z.string(),
      hasEndDate: z.boolean(),
      endDate: z.string(),
      autoCreate: z.boolean(),
      remindDaysBefore: z.string(),
      categoryId: z.string(),
      notes: z.string().max(500, `${E}notesTooLong`),
      isActive: z.boolean(),
    })
    .superRefine((v, ctx) => {
      const issue = (path: keyof RecurringFormValues, message: string) =>
        ctx.addIssue({ code: 'custom', path: [path], message: `${E}${message}` });

      const cents = parseMoneyToCents(v.amount, locale);
      if (cents == null || cents <= 0) issue('amount', 'amount');
      const interval = parseWholeNumber(v.interval);
      if (interval == null || interval < 1 || interval > 52) issue('interval', 'interval');
      const remind = parseWholeNumber(v.remindDaysBefore);
      if (remind == null || remind > 30) issue('remindDaysBefore', 'remindDays');
      if (!isISODate(v.anchorDate)) issue('anchorDate', 'date');
      if (v.hasEndDate) {
        if (!isISODate(v.endDate)) issue('endDate', 'date');
        else if (isISODate(v.anchorDate) && v.endDate < v.anchorDate)
          issue('endDate', 'endBeforeStart');
      }
    });
}

export function defaultRecurringFormValues({
  accountId,
  today,
}: {
  accountId: string;
  today: string;
}): RecurringFormValues {
  return {
    payee: '',
    amount: '',
    direction: 'out',
    accountId,
    frequency: 'monthly',
    interval: '1',
    anchorDate: today,
    hasEndDate: false,
    endDate: today,
    autoCreate: true,
    remindDaysBefore: '2',
    categoryId: '',
    notes: '',
    isActive: true,
  };
}

/** Pre-fill from a detected pattern ("Looks recurring: Netflix"). */
export function suggestionToFormValues(
  s: Pick<RecurringSuggestion, 'accountId' | 'payee' | 'amountCents' | 'anchorDate' | 'categoryId'>,
  locale: string,
  today: string,
): RecurringFormValues {
  return {
    ...defaultRecurringFormValues({ accountId: s.accountId, today }),
    payee: s.payee,
    amount: centsToInputString(Math.abs(s.amountCents), locale),
    direction: directionOf(s.amountCents),
    anchorDate: s.anchorDate,
    categoryId: s.categoryId ?? '',
  };
}

export function ruleToFormValues(rule: RecurringRule, locale: string): RecurringFormValues {
  return {
    payee: rule.payee,
    amount: centsToInputString(Math.abs(rule.amountCents), locale),
    direction: directionOf(rule.amountCents),
    accountId: rule.accountId,
    frequency: rule.frequency,
    interval: String(rule.interval),
    anchorDate: rule.anchorDate,
    hasEndDate: rule.endDate != null,
    endDate: rule.endDate ?? rule.anchorDate,
    autoCreate: rule.autoCreate,
    remindDaysBefore: String(rule.remindDaysBefore),
    categoryId: rule.categoryId ?? '',
    notes: rule.notes ?? '',
    isActive: rule.isActive,
  };
}

/**
 * Convert validated values. The next date is the first occurrence on or after today: past
 * occurrences are never back-filled (they are usually recorded or imported already). A rule whose
 * end date has passed is saved inactive.
 */
export function toRecurringRuleInput(
  v: RecurringFormValues,
  locale: string,
  today: string,
): RecurringRuleInput {
  const timing = {
    frequency: v.frequency,
    interval: parseWholeNumber(v.interval) ?? 1,
    anchorDate: v.anchorDate,
    endDate: v.hasEndDate ? v.endDate : null,
  };
  const nextDate = firstOccurrenceOnOrAfter(timing, today);
  return {
    ...timing,
    accountId: v.accountId,
    payee: v.payee.trim(),
    amountCents: signedAmountCents(
      'adjustment',
      parseMoneyToCents(v.amount, locale) ?? 0,
      v.direction,
    ),
    nextDate: nextDate ?? timing.endDate ?? v.anchorDate,
    autoCreate: v.autoCreate,
    remindDaysBefore: parseWholeNumber(v.remindDaysBefore) ?? 0,
    categoryId: v.categoryId === '' ? null : v.categoryId,
    notes: v.notes.trim() === '' ? null : v.notes.trim(),
    isActive: v.isActive && nextDate != null,
  };
}
