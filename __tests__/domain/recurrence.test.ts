import {
  detectRecurring,
  firstOccurrenceOnOrAfter,
  monthlyEquivalentCents,
  nextOccurrences,
  occurrenceAt,
  planRecurringRun,
  recurringTransactionType,
  suggestionKey,
  type DetectionTransaction,
  type RecurrenceRule,
  type RunnableRule,
} from '@/domain/recurrence';

const monthly = (overrides: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  frequency: 'monthly',
  interval: 1,
  anchorDate: '2026-01-15',
  endDate: null,
  ...overrides,
});

describe('occurrenceAt', () => {
  it('steps by days for weekly and biweekly', () => {
    expect(occurrenceAt(monthly({ frequency: 'weekly' }), 2)).toBe('2026-01-29');
    expect(occurrenceAt(monthly({ frequency: 'biweekly' }), 1)).toBe('2026-01-29');
  });

  it('steps by months for monthly, quarterly and yearly', () => {
    expect(occurrenceAt(monthly(), 3)).toBe('2026-04-15');
    expect(occurrenceAt(monthly({ frequency: 'quarterly' }), 1)).toBe('2026-04-15');
    expect(occurrenceAt(monthly({ frequency: 'yearly' }), 1)).toBe('2027-01-15');
  });

  it('honours the interval', () => {
    expect(occurrenceAt(monthly({ interval: 2 }), 1)).toBe('2026-03-15');
    expect(occurrenceAt(monthly({ frequency: 'weekly', interval: 3 }), 1)).toBe('2026-02-05');
  });

  it('clamps the 31st to short months and recovers afterwards', () => {
    const rule = monthly({ anchorDate: '2026-01-31' });
    expect([1, 2, 3].map((n) => occurrenceAt(rule, n))).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('handles Feb 29 yearly rules', () => {
    const rule = monthly({ frequency: 'yearly', anchorDate: '2028-02-29' });
    expect(occurrenceAt(rule, 1)).toBe('2029-02-28');
    expect(occurrenceAt(rule, 4)).toBe('2032-02-29');
  });

  it('rejects a bad interval', () => {
    expect(() => occurrenceAt(monthly({ interval: 0 }), 1)).toThrow(RangeError);
    expect(() => occurrenceAt(monthly({ interval: 1.5 }), 1)).toThrow(RangeError);
  });
});

describe('nextOccurrences', () => {
  it('lists occurrences in the range inclusive', () => {
    expect(nextOccurrences(monthly(), '2026-03-15', '2026-05-15')).toEqual([
      '2026-03-15',
      '2026-04-15',
      '2026-05-15',
    ]);
  });

  it('never returns dates before the anchor', () => {
    expect(nextOccurrences(monthly(), '2025-12-01', '2026-02-01')).toEqual(['2026-01-15']);
  });

  it('stops at the end date', () => {
    expect(nextOccurrences(monthly({ endDate: '2026-03-20' }), '2026-01-01', '2026-12-31')).toEqual(
      ['2026-01-15', '2026-02-15', '2026-03-15'],
    );
  });

  it('expands weekly rules within a window', () => {
    expect(nextOccurrences(monthly({ frequency: 'weekly' }), '2026-10-30', '2026-11-13')).toEqual([
      '2026-11-05',
      '2026-11-12',
    ]);
  });

  it('finds far-future occurrences of an old anchor without skipping any', () => {
    const rule = monthly({ anchorDate: '2000-01-31' });
    expect(nextOccurrences(rule, '2026-02-01', '2026-04-30')).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('is empty for an inverted range and respects the limit', () => {
    expect(nextOccurrences(monthly(), '2026-05-01', '2026-04-01')).toEqual([]);
    expect(nextOccurrences(monthly(), '2026-01-01', '2026-12-31', 2)).toHaveLength(2);
  });
});

describe('firstOccurrenceOnOrAfter', () => {
  it('includes the date itself', () => {
    expect(firstOccurrenceOnOrAfter(monthly(), '2026-03-15')).toBe('2026-03-15');
    expect(firstOccurrenceOnOrAfter(monthly(), '2026-03-16')).toBe('2026-04-15');
  });

  it('works for long intervals', () => {
    const rule = monthly({ frequency: 'yearly', interval: 2 });
    expect(firstOccurrenceOnOrAfter(rule, '2026-02-01')).toBe('2028-01-15');
  });

  it('is null after the end date', () => {
    expect(firstOccurrenceOnOrAfter(monthly({ endDate: '2026-03-01' }), '2026-03-02')).toBeNull();
  });
});

describe('monthlyEquivalentCents', () => {
  it.each([
    ['monthly', 1, -1699, -1699],
    ['monthly', 2, -2000, -1000],
    ['yearly', 1, -12000, -1000],
    ['quarterly', 1, -3000, -1000],
    ['weekly', 1, -1000, -4333],
    ['biweekly', 1, 100000, 216667],
  ] as const)('%s every %i of %i → %i', (frequency, interval, amountCents, expected) => {
    expect(monthlyEquivalentCents({ frequency, interval, amountCents })).toBe(expected);
  });

  it('never returns -0', () => {
    expect(
      Object.is(monthlyEquivalentCents({ frequency: 'yearly', interval: 1, amountCents: -1 }), 0),
    ).toBe(true);
  });
});

describe('planRecurringRun', () => {
  const netflix = (overrides: Partial<RunnableRule> = {}): RunnableRule => ({
    ...monthly({ anchorDate: '2026-01-03' }),
    isActive: true,
    autoCreate: true,
    nextDate: '2026-11-03',
    ...overrides,
  });

  it('creates the due occurrence and moves past today', () => {
    expect(planRecurringRun(netflix(), '2026-11-03')).toEqual({
      create: ['2026-11-03'],
      nextDate: '2026-12-03',
    });
  });

  it('a monthly Netflix rule generates exactly one transaction per period', () => {
    let rule = netflix();
    const created: string[] = [];
    // Open the app every day from Oct 30 to Jan 10, some days twice.
    for (let day = 0; day <= 72; day++) {
      const today = new Date(2026, 9, 30 + day);
      const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      for (let opens = 0; opens < 2; opens++) {
        const plan = planRecurringRun(rule, iso);
        created.push(...plan.create);
        rule = { ...rule, nextDate: plan.nextDate! };
      }
    }
    expect(created).toEqual(['2026-11-03', '2026-12-03', '2027-01-03']);
  });

  it('catches up on occurrences missed while the app was closed', () => {
    expect(planRecurringRun(netflix({ nextDate: '2026-09-03' }), '2026-11-10')).toEqual({
      create: ['2026-09-03', '2026-10-03', '2026-11-03'],
      nextDate: '2026-12-03',
    });
  });

  it('does nothing before the next date', () => {
    expect(planRecurringRun(netflix(), '2026-11-02')).toEqual({
      create: [],
      nextDate: '2026-11-03',
    });
  });

  it('ends after the end date', () => {
    expect(planRecurringRun(netflix({ endDate: '2026-11-30' }), '2026-11-03')).toEqual({
      create: ['2026-11-03'],
      nextDate: null,
    });
  });

  it('reminder-only rules just move their next date forward', () => {
    const rule = netflix({ autoCreate: false, nextDate: '2026-09-03' });
    expect(planRecurringRun(rule, '2026-11-03')).toEqual({ create: [], nextDate: '2026-11-03' });
    expect(planRecurringRun(rule, '2026-11-04')).toEqual({ create: [], nextDate: '2026-12-03' });
    expect(planRecurringRun({ ...rule, nextDate: '2026-12-03' }, '2026-11-04').nextDate).toBe(
      '2026-12-03',
    );
  });

  it('leaves paused rules alone', () => {
    expect(planRecurringRun(netflix({ isActive: false }), '2027-06-01')).toEqual({
      create: [],
      nextDate: '2026-11-03',
    });
  });
});

describe('recurringTransactionType', () => {
  it('charges are purchases; money in is a payment on a card, a deposit elsewhere', () => {
    expect(recurringTransactionType('credit', -1699)).toBe('purchase');
    expect(recurringTransactionType('debit', -1699)).toBe('purchase');
    expect(recurringTransactionType('debit', 250000)).toBe('deposit');
    expect(recurringTransactionType('credit', 5000)).toBe('payment');
  });
});

describe('detectRecurring', () => {
  const tx = (
    date: string,
    overrides: Partial<DetectionTransaction> = {},
  ): DetectionTransaction => ({
    accountId: 'visa',
    date,
    payee: 'NETFLIX.COM',
    amountCents: -1699,
    status: 'posted',
    transferGroupId: null,
    recurringId: null,
    categoryId: null,
    ...overrides,
  });
  const none = { today: '2026-10-30', ruleKeys: new Set<string>(), dismissed: new Set<string>() };
  const threeMonths = [
    tx('2026-08-03'),
    tx('2026-09-03', { categoryId: 'sys-subscriptions' }),
    tx('2026-10-03', { payee: 'Netflix.com' }),
  ];

  it('suggests a monthly rule after 3 similar charges', () => {
    expect(detectRecurring(threeMonths, none)).toEqual([
      {
        key: 'visa|netflix com',
        accountId: 'visa',
        payee: 'Netflix.com',
        amountCents: -1699,
        categoryId: 'sys-subscriptions',
        frequency: 'monthly',
        anchorDate: '2026-10-03',
        months: 3,
      },
    ]);
  });

  it('tolerates small price changes but not different amounts', () => {
    const drift = [tx('2026-08-03', { amountCents: -1599 }), ...threeMonths.slice(1)];
    expect(detectRecurring(drift, none)).toHaveLength(1);
    const different = [tx('2026-08-03', { amountCents: -5000 }), ...threeMonths.slice(1)];
    expect(detectRecurring(different, none)).toEqual([]);
  });

  it('needs three different months', () => {
    expect(detectRecurring(threeMonths.slice(1), none)).toEqual([]);
    expect(detectRecurring([tx('2026-10-01'), tx('2026-10-10'), tx('2026-10-20')], none)).toEqual(
      [],
    );
  });

  it('needs roughly monthly spacing', () => {
    expect(detectRecurring([tx('2026-06-03'), tx('2026-08-03'), tx('2026-10-03')], none)).toEqual(
      [],
    );
  });

  it('skips charges that stopped', () => {
    expect(detectRecurring(threeMonths, { ...none, today: '2027-01-01' })).toEqual([]);
  });

  it('skips payees with a rule, dismissed ones, and rows that are not charges', () => {
    const key = suggestionKey('visa', 'netflix.com');
    expect(detectRecurring(threeMonths, { ...none, ruleKeys: new Set([key]) })).toEqual([]);
    expect(detectRecurring(threeMonths, { ...none, dismissed: new Set([key]) })).toEqual([]);
    const notCharges = threeMonths.map(
      (t, i) =>
        [
          { ...t, status: 'void' as const },
          { ...t, transferGroupId: 'g' },
          { ...t, recurringId: 'r' },
        ][i],
    );
    expect(detectRecurring(notCharges, none)).toEqual([]);
    expect(
      detectRecurring(
        threeMonths.map((t) => ({ ...t, amountCents: 1699 })),
        none,
      ),
    ).toEqual([]);
  });

  it('keeps accounts apart', () => {
    const mixed = [tx('2026-08-03'), tx('2026-09-03', { accountId: 'amex' }), tx('2026-10-03')];
    expect(detectRecurring(mixed, none)).toEqual([]);
  });
});
