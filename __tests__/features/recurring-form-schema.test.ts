import type { RecurringRule } from '@/db/schema';
import {
  defaultRecurringFormValues,
  recurringFormSchema,
  ruleToFormValues,
  suggestionToFormValues,
  toRecurringRuleInput,
  type RecurringFormValues,
} from '@/features/recurring/recurring-form-schema';

const today = '2026-10-30';

function values(overrides: Partial<RecurringFormValues> = {}): RecurringFormValues {
  return {
    ...defaultRecurringFormValues({ accountId: 'visa', today }),
    payee: 'Netflix',
    amount: '16.99',
    anchorDate: '2026-10-03',
    ...overrides,
  };
}

function errors(v: RecurringFormValues) {
  const result = recurringFormSchema('en-CA').safeParse(v);
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message]));
}

describe('recurringFormSchema', () => {
  it('accepts a monthly charge', () => {
    expect(errors(values())).toEqual({});
  });

  it('checks payee, amount, interval and reminder days', () => {
    const e = errors(
      values({ payee: ' ', amount: '0', interval: '0', remindDaysBefore: '31', accountId: '' }),
    );
    expect(e).toEqual({
      payee: 'recurringForm.errors.payeeRequired',
      amount: 'recurringForm.errors.amount',
      interval: 'recurringForm.errors.interval',
      remindDaysBefore: 'recurringForm.errors.remindDays',
      accountId: 'recurringForm.errors.accountRequired',
    });
    expect(errors(values({ interval: 'x', remindDaysBefore: '' }))).toMatchObject({
      interval: 'recurringForm.errors.interval',
      remindDaysBefore: 'recurringForm.errors.remindDays',
    });
  });

  it('checks dates, including an end before the start', () => {
    expect(errors(values({ anchorDate: 'nope' })).anchorDate).toBe('recurringForm.errors.date');
    expect(errors(values({ hasEndDate: true, endDate: '2026-09-01' })).endDate).toBe(
      'recurringForm.errors.endBeforeStart',
    );
    expect(errors(values({ hasEndDate: true, endDate: 'bad' })).endDate).toBe(
      'recurringForm.errors.date',
    );
    // The end date is ignored while the switch is off.
    expect(errors(values({ hasEndDate: false, endDate: 'bad' }))).toEqual({});
  });
});

describe('toRecurringRuleInput', () => {
  it('stores a charge as negative with the next date after today', () => {
    expect(
      toRecurringRuleInput(values({ categoryId: 'sys-subscriptions' }), 'en-CA', today),
    ).toEqual({
      accountId: 'visa',
      payee: 'Netflix',
      amountCents: -1699,
      frequency: 'monthly',
      interval: 1,
      anchorDate: '2026-10-03',
      endDate: null,
      nextDate: '2026-11-03',
      autoCreate: true,
      remindDaysBefore: 2,
      categoryId: 'sys-subscriptions',
      notes: null,
      isActive: true,
    });
  });

  it('a charge due today is next today, so it is created right away', () => {
    expect(toRecurringRuleInput(values({ anchorDate: today }), 'en-CA', today).nextDate).toBe(
      today,
    );
  });

  it('money in is positive; a future anchor is the next date', () => {
    const input = toRecurringRuleInput(
      values({ direction: 'in', anchorDate: '2026-11-14', frequency: 'biweekly' }),
      'en-CA',
      today,
    );
    expect(input).toMatchObject({ amountCents: 1699, nextDate: '2026-11-14' });
  });

  it('a rule that already ended is saved inactive', () => {
    const input = toRecurringRuleInput(
      values({ hasEndDate: true, endDate: '2026-10-10' }),
      'en-CA',
      today,
    );
    expect(input).toMatchObject({ isActive: false, endDate: '2026-10-10', nextDate: '2026-10-10' });
  });

  it('keeps a paused rule paused', () => {
    expect(toRecurringRuleInput(values({ isActive: false }), 'en-CA', today).isActive).toBe(false);
  });
});

describe('pre-filling', () => {
  it('round-trips a rule', () => {
    const rule: RecurringRule = {
      id: 'r',
      accountId: 'visa',
      payee: 'Gym',
      amountCents: -4500,
      categoryId: null,
      frequency: 'monthly',
      interval: 1,
      anchorDate: '2026-01-01',
      nextDate: '2026-11-01',
      endDate: '2027-01-01',
      autoCreate: false,
      remindDaysBefore: 3,
      isActive: true,
      notes: 'Contract',
      createdAt: '',
      updatedAt: '',
    };
    const v = ruleToFormValues(rule, 'en-CA');
    expect(v).toMatchObject({
      amount: '45.00',
      direction: 'out',
      hasEndDate: true,
      endDate: '2027-01-01',
      remindDaysBefore: '3',
    });
    expect(toRecurringRuleInput(v, 'en-CA', today)).toMatchObject({
      amountCents: -4500,
      endDate: '2027-01-01',
      notes: 'Contract',
      autoCreate: false,
    });
  });

  it('fills from a suggestion', () => {
    expect(
      suggestionToFormValues(
        {
          accountId: 'visa',
          payee: 'Netflix.com',
          amountCents: -1699,
          anchorDate: '2026-10-03',
          categoryId: null,
        },
        'en-CA',
        today,
      ),
    ).toMatchObject({
      payee: 'Netflix.com',
      amount: '16.99',
      direction: 'out',
      anchorDate: '2026-10-03',
      frequency: 'monthly',
      categoryId: '',
    });
  });
});
