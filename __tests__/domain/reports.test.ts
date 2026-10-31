import {
  biggestChanges,
  comparisonRanges,
  monthlyAverage,
  withChanges,
  foldTail,
  monthWindow,
  spendingByAccount,
  spendingByCategory,
  spendingByMonth,
  topPayees,
  totalSpendingCents,
  type ReportTransaction,
} from '@/domain/reports';

const tx = (overrides: Partial<ReportTransaction>): ReportTransaction => ({
  accountId: 'visa',
  categoryId: 'sys-dining',
  payee: 'Tim Hortons',
  date: '2026-10-05',
  amountCents: -500,
  type: 'purchase',
  status: 'posted',
  transferGroupId: null,
  ...overrides,
});

const rows: ReportTransaction[] = [
  tx({}),
  tx({ payee: 'TIM HORTONS #1234', amountCents: -300, status: 'pending' }),
  tx({ categoryId: 'sys-groceries', payee: 'Loblaws', amountCents: -8000, accountId: 'mc' }),
  tx({ categoryId: 'sys-groceries', payee: 'Loblaws', amountCents: 1000, type: 'refund' }),
  tx({ categoryId: null, payee: 'Corner store', amountCents: -200, date: '2026-09-30' }),
  // Never spending:
  tx({ amountCents: -9999, status: 'void' }),
  tx({ amountCents: -5000, type: 'transfer', transferGroupId: 'g' }),
  tx({ amountCents: 250000, type: 'deposit', categoryId: 'sys-income' }),
  tx({ amountCents: 30000, type: 'payment' }),
];

describe('spending reports', () => {
  it('totals net spending', () => {
    expect(totalSpendingCents(rows)).toBe(8000);
    expect(Object.is(totalSpendingCents([]), 0)).toBe(true);
  });

  it('ranks categories; refunds reduce their category', () => {
    expect(spendingByCategory(rows)).toEqual([
      { key: 'sys-groceries', cents: 7000, share: 0.875 },
      { key: 'sys-dining', cents: 800, share: 0.1 },
      { key: null, cents: 200, share: 0.025 },
    ]);
  });

  it('leaves out categories that net to zero or less', () => {
    expect(
      spendingByCategory([tx({ amountCents: -500 }), tx({ amountCents: 700, type: 'refund' })]),
    ).toEqual([]);
  });

  it('ranks accounts, leaving out ones that net to zero', () => {
    // Visa: 5.00 + 3.00 + 2.00 spent, 10.00 refunded → 0.
    expect(spendingByAccount(rows)).toEqual([{ key: 'mc', cents: 8000, share: 1 }]);
  });

  it('groups payee spellings and counts visits', () => {
    expect(topPayees(rows)).toEqual([
      { key: 'loblaws', payee: 'Loblaws', cents: 7000, share: 0.875, count: 2 },
      { key: 'tim hortons', payee: 'Tim Hortons', cents: 800, share: 0.1, count: 2 },
      { key: 'corner store', payee: 'Corner store', cents: 200, share: 0.025, count: 1 },
    ]);
    expect(topPayees(rows, 1)).toHaveLength(1);
  });

  it('totals 12 months, oldest first, including empty months', () => {
    const months = spendingByMonth(rows, '2026-10-30');
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ month: '2025-11', cents: 0 });
    expect(months.slice(-2)).toEqual([
      { month: '2026-09', cents: 200 },
      { month: '2026-10', cents: 7800 },
    ]);
  });

  it('gives the window those months cover', () => {
    expect(monthWindow('2026-10-30')).toEqual({ from: '2025-11-01', to: '2026-10-31' });
    expect(monthWindow('2026-02-10', 3)).toEqual({ from: '2025-12-01', to: '2026-02-28' });
  });

  it('folds the tail into Other', () => {
    const ranked = spendingByCategory(rows);
    expect(foldTail(ranked, 1)).toEqual({
      shown: [ranked[0]],
      other: { cents: 1000, share: 0.125, count: 2 },
    });
    expect(foldTail(ranked, 5)).toEqual({ shown: ranked, other: null });
  });
});

describe('comparisonRanges', () => {
  it('compares this month so far with the same days of last month', () => {
    expect(comparisonRanges({ from: '2026-10-01', to: '2026-10-31' }, '2026-10-15')).toEqual({
      current: { from: '2026-10-01', to: '2026-10-15' },
      previous: { from: '2026-09-01', to: '2026-09-15' },
    });
  });

  it('compares a whole month with the whole month before, even a shorter one', () => {
    expect(comparisonRanges({ from: '2026-03-01', to: '2026-03-31' }, '2026-04-10')).toEqual({
      current: { from: '2026-03-01', to: '2026-03-31' },
      previous: { from: '2026-02-01', to: '2026-02-28' },
    });
  });

  it('compares the year so far with the same months a year before', () => {
    expect(comparisonRanges({ from: '2026-01-01', to: '2026-10-31' }, '2026-10-31')).toEqual({
      current: { from: '2026-01-01', to: '2026-10-31' },
      previous: { from: '2025-01-01', to: '2025-10-31' },
    });
  });

  it('compares a rolling window with the same number of days just before it', () => {
    expect(comparisonRanges({ from: '2026-08-03', to: '2026-10-31' }, '2026-10-31')).toEqual({
      current: { from: '2026-08-03', to: '2026-10-31' },
      previous: { from: '2026-05-05', to: '2026-08-02' },
    });
  });

  it('has nothing to compare all-time with', () => {
    expect(comparisonRanges({}, '2026-10-31')).toBeNull();
  });
});

describe('category changes', () => {
  const now = [
    { key: 'dining', cents: 30000, share: 0.6 },
    { key: 'groceries', cents: 20000, share: 0.4 },
  ];
  const before = [
    { key: 'groceries', cents: 26000, share: 0.5 },
    { key: 'travel', cents: 26000, share: 0.5 },
  ];

  it('pairs each row with the previous period', () => {
    expect(withChanges(now, before).map((r) => [r.key, r.previousCents, r.changeCents])).toEqual([
      ['dining', 0, 30000],
      ['groceries', 26000, -6000],
    ]);
  });

  it('finds the biggest moves either way, including categories that dropped to nothing', () => {
    expect(biggestChanges(now, before, { limit: 3 })).toEqual([
      { key: 'dining', changeCents: 30000 },
      { key: 'travel', changeCents: -26000 },
      { key: 'groceries', changeCents: -6000 },
    ]);
    expect(biggestChanges(now, before, { minimumCents: 10000 })).toHaveLength(2);
  });
});

describe('monthlyAverage', () => {
  it('averages complete months from the first one with spending', () => {
    expect(
      monthlyAverage([
        { month: '2026-07', cents: 0 },
        { month: '2026-08', cents: 100000 },
        { month: '2026-09', cents: 0 },
        { month: '2026-10', cents: 50000 },
        { month: '2026-11', cents: 99999 }, // in progress
      ]),
    ).toBe(50000);
  });

  it('is null without a complete month of spending', () => {
    expect(monthlyAverage([{ month: '2026-10', cents: 5000 }])).toBeNull();
  });
});
