/**
 * @jest-environment node
 */
import type { Account } from '@/db/schema';
import { createTestDatabase } from '@/db/test-database';
import {
  accountFormSchema,
  accountToFormValues,
  defaultAccountFormValues,
  toAccountInput,
  type AccountFormValues,
} from '@/features/accounts/account-form-schema';
import { withSummaries } from '@/features/accounts/account-summaries';

const defaults = defaultAccountFormValues({ currency: 'CAD', today: '2026-10-29' });

const visaValues: AccountFormValues = {
  ...defaults,
  name: 'TD Aeroplan Visa',
  institution: 'TD',
  type: 'credit',
  network: 'visa',
  last4: '1234',
  openingBalance: '500.00',
  creditLimit: '5,000',
  statementDay: '15',
  dueDayOffset: '21',
  interestRate: '20.99',
};

const chequingValues: AccountFormValues = {
  ...defaults,
  name: 'RBC Chequing',
  institution: 'RBC',
  type: 'debit',
  network: 'interac',
  openingBalance: '2,345.67',
  // Credit fields left over from switching type must be ignored.
  creditLimit: '9999',
  statementDay: '3',
  interestRate: '5',
};

function errorsFor(values: AccountFormValues, locale = 'en-CA') {
  const result = accountFormSchema(locale).safeParse(values);
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message]));
}

describe('validation', () => {
  it('accepts valid credit and chequing accounts', () => {
    expect(errorsFor(visaValues)).toEqual({});
    expect(errorsFor(chequingValues)).toEqual({});
  });

  it('requires a name', () => {
    expect(errorsFor({ ...visaValues, name: '   ' })).toEqual({
      name: 'accountForm.errors.nameRequired',
    });
  });

  it('rejects anything but exactly 4 digits for last4', () => {
    for (const last4 of ['123', '12345', '4111111111111111', 'abcd']) {
      expect(errorsFor({ ...visaValues, last4 })).toEqual({ last4: 'accountForm.errors.last4' });
    }
    expect(errorsFor({ ...visaValues, last4: '' })).toEqual({});
  });

  it('ignores last4 on types without a card', () => {
    expect(errorsFor({ ...visaValues, type: 'savings', last4: '12' })).toEqual({});
  });

  it('validates amounts, days and rates', () => {
    expect(
      errorsFor({
        ...visaValues,
        openingBalance: '12.345',
        creditLimit: '-5',
        statementDay: '32',
        dueDayOffset: '91',
        interestRate: '120',
      }),
    ).toEqual({
      openingBalance: 'accountForm.errors.amount',
      creditLimit: 'accountForm.errors.amount',
      statementDay: 'accountForm.errors.statementDay',
      dueDayOffset: 'accountForm.errors.dueDayOffset',
      interestRate: 'accountForm.errors.rate',
    });
    expect(errorsFor({ ...visaValues, statementDay: '0' })).toHaveProperty('statementDay');
    expect(errorsFor({ ...visaValues, statementDay: '1.5' })).toHaveProperty('statementDay');
  });

  it('validates currency and the opening date', () => {
    expect(errorsFor({ ...visaValues, currency: 'cad' })).toEqual({});
    expect(errorsFor({ ...visaValues, currency: 'CA' })).toHaveProperty('currency');
    expect(errorsFor({ ...visaValues, openingBalanceDate: '2026-02-30' })).toHaveProperty(
      'openingBalanceDate',
    );
  });

  it('uses the locale for amounts', () => {
    expect(
      errorsFor({ ...visaValues, openingBalance: '500,00', creditLimit: '5 000' }, 'fr-CA'),
    ).toEqual({});
    expect(errorsFor({ ...visaValues, openingBalance: '500,00' }, 'en-CA')).toHaveProperty(
      'openingBalance',
    );
  });
});

describe('toAccountInput', () => {
  it('converts a loan: owed like a card, but no card details, limit or statement', () => {
    expect(
      toAccountInput(
        { ...visaValues, name: 'Car loan', type: 'loan', openingBalance: '18000' },
        'en-CA',
      ),
    ).toMatchObject({
      type: 'loan',
      network: null,
      last4: null,
      openingBalanceCents: -1800000,
      creditLimitCents: null,
      statementDay: null,
      dueDayOffset: null,
      interestRateBps: 2099,
    });
  });

  it('converts a Visa: owed is stored negative, rates in bps', () => {
    expect(toAccountInput(visaValues, 'en-CA')).toEqual({
      name: 'TD Aeroplan Visa',
      institution: 'TD',
      type: 'credit',
      network: 'visa',
      last4: '1234',
      currency: 'CAD',
      color: defaults.color,
      openingBalanceCents: -50000,
      openingBalanceDate: '2026-10-29',
      creditLimitCents: 500000,
      statementDay: 15,
      dueDayOffset: 21,
      interestRateBps: 2099,
    });
  });

  it('clears credit-only and card-only fields for other types', () => {
    const input = toAccountInput({ ...chequingValues, type: 'savings', last4: '9999' }, 'en-CA');
    expect(input).toMatchObject({
      openingBalanceCents: 234567,
      network: null,
      last4: null,
      creditLimitCents: null,
      statementDay: null,
      dueDayOffset: null,
      interestRateBps: null,
    });
  });

  it('treats blanks as empty and defaults the due offset', () => {
    const input = toAccountInput(
      {
        ...visaValues,
        openingBalance: '',
        creditLimit: '',
        interestRate: '',
        dueDayOffset: '',
        last4: '',
        network: '',
      },
      'en-CA',
    );
    expect(input).toMatchObject({
      openingBalanceCents: 0,
      creditLimitCents: null,
      interestRateBps: null,
      dueDayOffset: 21,
      last4: null,
      network: null,
    });
    expect(toAccountInput({ ...visaValues, statementDay: '' }, 'en-CA').dueDayOffset).toBeNull();
  });
});

describe('edit round trip', () => {
  it('form → account → form gives the same values', () => {
    const t = createTestDatabase();
    for (const locale of ['en-CA', 'fr-CA']) {
      const account = t.repos.accounts.create(toAccountInput(visaValues, 'en-CA'));
      const values = accountToFormValues(account as Account, locale);
      expect(toAccountInput(values, locale)).toEqual(toAccountInput(visaValues, 'en-CA'));
    }
    t.close();
  });
});

describe('Phase 2 done-check: a Visa and a chequing account show correct opening balances', () => {
  it('owes $500.00 with $4,500.00 available on the Visa; $2,345.67 in chequing', () => {
    const t = createTestDatabase();
    t.repos.accounts.create(toAccountInput(visaValues, 'en-CA'));
    t.repos.accounts.create(toAccountInput(chequingValues, 'en-CA'));

    const [visa, chequing] = withSummaries(
      t.repos.accounts.list(),
      t.repos.transactions.totalsByAccount(),
    );
    expect(visa.summary).toEqual({
      balanceCents: 50000,
      isLiability: true,
      pendingHoldsCents: 0,
      availableCreditCents: 450000,
      utilization: 0.1,
    });
    expect(chequing.summary).toMatchObject({ balanceCents: 234567, isLiability: false });
    t.close();
  });
});
