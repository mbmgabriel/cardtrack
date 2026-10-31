/**
 * Account form values are the strings the user typed; this module validates them (messages are
 * i18n keys) and converts to/from the repository's AccountInput.
 */
import { z } from 'zod';

import type { Account } from '@/db/schema';
import type { AccountInput } from '@/db/repositories/accounts';
import { openingBalanceForDisplay, openingBalanceToStored } from '@/domain/balances';
import { DEFAULT_DUE_DAY_OFFSET, isISODate } from '@/domain/dates';
import { centsToInputString, parseMoneyToCents } from '@/domain/money';
import { bpsToInputString, parseRateToBps } from '@/domain/rates';
import { ACCOUNT_TYPES, CARD_NETWORKS, hasCardDetails, isLiabilityAccount } from '@/domain/types';
import { currencyCodeSchema, hexColorSchema, isValidLast4 } from '@/domain/validation';

import { ACCOUNT_COLORS } from './colors';

export type AccountFormValues = {
  name: string;
  institution: string;
  type: (typeof ACCOUNT_TYPES)[number];
  network: (typeof CARD_NETWORKS)[number] | '';
  last4: string;
  currency: string;
  color: string;
  openingBalance: string;
  openingBalanceDate: string;
  creditLimit: string;
  statementDay: string;
  dueDayOffset: string;
  interestRate: string;
};

const E = 'accountForm.errors.';

function parseWholeNumber(value: string): number | null {
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
}

export function accountFormSchema(locale: string) {
  return z
    .object({
      name: z.string().trim().min(1, `${E}nameRequired`).max(60, `${E}nameTooLong`),
      institution: z.string().trim().max(60, `${E}institutionTooLong`),
      type: z.enum(ACCOUNT_TYPES),
      network: z.union([z.enum(CARD_NETWORKS), z.literal('')]),
      last4: z.string().trim(),
      currency: z.string().trim().toUpperCase().pipe(currencyCodeSchema),
      color: hexColorSchema,
      openingBalance: z.string(),
      openingBalanceDate: z.string(),
      creditLimit: z.string(),
      statementDay: z.string(),
      dueDayOffset: z.string(),
      interestRate: z.string(),
    })
    .superRefine((v, ctx) => {
      const issue = (path: keyof AccountFormValues, message: string) =>
        ctx.addIssue({ code: 'custom', path: [path], message: `${E}${message}` });

      if (hasCardDetails(v.type) && v.last4 !== '' && !isValidLast4(v.last4)) {
        issue('last4', 'last4');
      }
      if (v.openingBalance.trim() !== '' && parseMoneyToCents(v.openingBalance, locale) == null) {
        issue('openingBalance', 'amount');
      }
      if (!isISODate(v.openingBalanceDate)) issue('openingBalanceDate', 'date');

      if (!isLiabilityAccount(v.type)) return;
      if (v.creditLimit.trim() !== '') {
        const limit = parseMoneyToCents(v.creditLimit, locale);
        if (limit == null || limit < 0) issue('creditLimit', 'amount');
      }
      if (v.statementDay.trim() !== '') {
        const day = parseWholeNumber(v.statementDay);
        if (day == null || day < 1 || day > 31) issue('statementDay', 'statementDay');
      }
      if (v.dueDayOffset.trim() !== '') {
        const offset = parseWholeNumber(v.dueDayOffset);
        if (offset == null || offset > 90) issue('dueDayOffset', 'dueDayOffset');
      }
      if (v.interestRate.trim() !== '' && parseRateToBps(v.interestRate, locale) == null) {
        issue('interestRate', 'rate');
      }
    });
}

export function defaultAccountFormValues({
  currency,
  today,
}: {
  currency: string;
  today: string;
}): AccountFormValues {
  return {
    name: '',
    institution: '',
    type: 'credit',
    network: '',
    last4: '',
    currency,
    color: ACCOUNT_COLORS[0],
    openingBalance: '',
    openingBalanceDate: today,
    creditLimit: '',
    statementDay: '',
    dueDayOffset: String(DEFAULT_DUE_DAY_OFFSET),
    interestRate: '',
  };
}

/** Convert validated form values. Fields that don't apply to the type are cleared. */
export function toAccountInput(v: AccountFormValues, locale: string): AccountInput {
  const liability = isLiabilityAccount(v.type);
  const card = hasCardDetails(v.type);
  // A loan has no limit or statement: its monthly payment is a recurring payment instead.
  const loan = v.type === 'loan';
  const entered = parseMoneyToCents(v.openingBalance, locale) ?? 0;
  const statementDay = liability && !loan ? parseWholeNumber(v.statementDay) : null;
  return {
    name: v.name.trim(),
    institution: v.institution.trim(),
    type: v.type,
    network: card && v.network !== '' ? v.network : null,
    last4: card && v.last4.trim() !== '' ? v.last4.trim() : null,
    currency: v.currency.trim().toUpperCase(),
    color: v.color,
    openingBalanceCents: openingBalanceToStored(v.type, entered),
    openingBalanceDate: v.openingBalanceDate,
    creditLimitCents: liability && !loan ? parseMoneyToCents(v.creditLimit, locale) : null,
    statementDay,
    dueDayOffset:
      statementDay == null ? null : (parseWholeNumber(v.dueDayOffset) ?? DEFAULT_DUE_DAY_OFFSET),
    interestRateBps: liability ? parseRateToBps(v.interestRate, locale) : null,
  };
}

export function accountToFormValues(a: Account, locale: string): AccountFormValues {
  return {
    name: a.name,
    institution: a.institution,
    type: a.type,
    network: a.network ?? '',
    last4: a.last4 ?? '',
    currency: a.currency,
    color: a.color,
    openingBalance: centsToInputString(
      openingBalanceForDisplay(a.type, a.openingBalanceCents),
      locale,
    ),
    openingBalanceDate: a.openingBalanceDate,
    creditLimit: a.creditLimitCents == null ? '' : centsToInputString(a.creditLimitCents, locale),
    statementDay: a.statementDay == null ? '' : String(a.statementDay),
    dueDayOffset: String(a.dueDayOffset ?? DEFAULT_DUE_DAY_OFFSET),
    interestRate: a.interestRateBps == null ? '' : bpsToInputString(a.interestRateBps, locale),
  };
}
