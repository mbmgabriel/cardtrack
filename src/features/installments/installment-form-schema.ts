/**
 * Instalment plan form values (what the user typed), validation (messages are i18n keys) and
 * conversion to/from the repository input.
 */
import { z } from 'zod';

import type { InstallmentInput } from '@/db/repositories/installments';
import type { InstallmentPlan } from '@/db/schema';
import { isISODate } from '@/domain/dates';
import { evenInstallmentCents } from '@/domain/installments';
import { centsToInputString, parseMoneyToCents } from '@/domain/money';

export type InstallmentFormValues = {
  description: string;
  principal: string;
  months: string;
  /** Blank = split the purchase evenly. */
  monthly: string;
  /** Blank = no fee. */
  monthlyFee: string;
  firstPaymentDate: string;
  notes: string;
};

const E = 'installmentForm.errors.';
export const MONTH_CHOICES = [3, 6, 12, 18, 24, 36] as const;

function wholeNumber(value: string): number | null {
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
}

export function installmentFormSchema(locale: string) {
  return z
    .object({
      description: z
        .string()
        .trim()
        .min(1, `${E}descriptionRequired`)
        .max(80, `${E}descriptionTooLong`),
      principal: z.string(),
      months: z.string(),
      monthly: z.string(),
      monthlyFee: z.string(),
      firstPaymentDate: z.string(),
      notes: z.string().max(500, `${E}notesTooLong`),
    })
    .superRefine((v, ctx) => {
      const issue = (path: keyof InstallmentFormValues, message: string) =>
        ctx.addIssue({ code: 'custom', path: [path], message: `${E}${message}` });
      const principal = parseMoneyToCents(v.principal, locale);
      if (principal == null || principal <= 0) issue('principal', 'amount');
      const months = wholeNumber(v.months);
      if (months == null || months < 1 || months > 120) issue('months', 'months');
      if (v.monthly.trim() !== '') {
        const monthly = parseMoneyToCents(v.monthly, locale);
        if (monthly == null || monthly <= 0) issue('monthly', 'amount');
        else if (principal != null && months != null && monthly * months < principal) {
          issue('monthly', 'tooSmall');
        }
      }
      if (v.monthlyFee.trim() !== '') {
        const fee = parseMoneyToCents(v.monthlyFee, locale);
        if (fee == null || fee < 0) issue('monthlyFee', 'amount');
      }
      if (!isISODate(v.firstPaymentDate)) issue('firstPaymentDate', 'date');
    });
}

export function defaultInstallmentFormValues(today: string): InstallmentFormValues {
  return {
    description: '',
    principal: '',
    months: '12',
    monthly: '',
    monthlyFee: '',
    firstPaymentDate: today,
    notes: '',
  };
}

/** The plan the values describe, or null while they're incomplete (for the live preview). */
export function previewPlan(v: InstallmentFormValues, locale: string) {
  const principalCents = parseMoneyToCents(v.principal, locale);
  const months = wholeNumber(v.months);
  if (principalCents == null || principalCents <= 0 || months == null || months < 1) return null;
  if (!isISODate(v.firstPaymentDate)) return null;
  const typed = v.monthly.trim() === '' ? null : parseMoneyToCents(v.monthly, locale);
  return {
    principalCents,
    months,
    monthlyCents: typed ?? evenInstallmentCents(principalCents, months),
    monthlyFeeCents:
      v.monthlyFee.trim() === '' ? 0 : (parseMoneyToCents(v.monthlyFee, locale) ?? 0),
    firstPaymentDate: v.firstPaymentDate,
  };
}

/** Convert validated values for the repository. */
export function toInstallmentInput(
  v: InstallmentFormValues,
  accountId: string,
  locale: string,
): InstallmentInput {
  const plan = previewPlan(v, locale)!;
  return {
    accountId,
    description: v.description.trim(),
    ...plan,
    notes: v.notes.trim() === '' ? null : v.notes.trim(),
  };
}

export function installmentToFormValues(
  plan: InstallmentPlan,
  locale: string,
): InstallmentFormValues {
  const even = evenInstallmentCents(plan.principalCents, plan.months);
  return {
    description: plan.description,
    principal: centsToInputString(plan.principalCents, locale),
    months: String(plan.months),
    monthly: plan.monthlyCents === even ? '' : centsToInputString(plan.monthlyCents, locale),
    monthlyFee: plan.monthlyFeeCents > 0 ? centsToInputString(plan.monthlyFeeCents, locale) : '',
    firstPaymentDate: plan.firstPaymentDate,
    notes: plan.notes ?? '',
  };
}
