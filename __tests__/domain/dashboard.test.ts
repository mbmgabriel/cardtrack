import {
  daysUntil,
  dueUrgency,
  isSpending,
  isWithinDays,
  monthRanges,
  percentChange,
} from '@/domain/dashboard';

describe('isSpending', () => {
  const tx = { type: 'purchase' as const, status: 'posted' as const, transferGroupId: null };

  it('counts purchases, refunds, fees and interest, posted or pending', () => {
    expect(isSpending(tx)).toBe(true);
    expect(isSpending({ ...tx, status: 'pending' })).toBe(true);
    expect(isSpending({ ...tx, type: 'refund' })).toBe(true);
    expect(isSpending({ ...tx, type: 'fee' })).toBe(true);
    expect(isSpending({ ...tx, type: 'interest' })).toBe(true);
  });

  it('excludes void rows, transfers, payments and deposits', () => {
    expect(isSpending({ ...tx, status: 'void' })).toBe(false);
    expect(isSpending({ ...tx, transferGroupId: 'g' })).toBe(false);
    expect(isSpending({ ...tx, type: 'payment' })).toBe(false);
    expect(isSpending({ ...tx, type: 'deposit' })).toBe(false);
    expect(isSpending({ ...tx, type: 'transfer' })).toBe(false);
    expect(isSpending({ ...tx, type: 'adjustment' })).toBe(false);
  });
});

describe('monthRanges', () => {
  it('compares the same days of last month', () => {
    expect(monthRanges('2026-03-15')).toEqual({
      thisMonth: { from: '2026-03-01', to: '2026-03-15' },
      lastMonthToDate: { from: '2026-02-01', to: '2026-02-15' },
      lastMonth: { from: '2026-02-01', to: '2026-02-28' },
    });
  });

  it('clamps to the end of a shorter last month', () => {
    expect(monthRanges('2026-03-31').lastMonthToDate).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });

  it('crosses the year boundary', () => {
    expect(monthRanges('2026-01-05').lastMonth).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
});

describe('percentChange', () => {
  it('is relative to the previous value', () => {
    expect(percentChange(150, 100)).toBe(0.5);
    expect(percentChange(50, 100)).toBe(-0.5);
  });

  it('is null with nothing to compare', () => {
    expect(percentChange(100, 0)).toBeNull();
  });

  it('handles a negative previous value (net refunds)', () => {
    expect(percentChange(0, -100)).toBe(1);
  });
});

describe('due dates', () => {
  it.each([
    [-1, 'overdue'],
    [0, 'urgent'],
    [3, 'urgent'],
    [4, 'soon'],
    [7, 'soon'],
    [8, 'later'],
  ] as const)('%i days → %s', (days, urgency) => {
    expect(dueUrgency(days)).toBe(urgency);
  });

  it('daysUntil and isWithinDays', () => {
    expect(daysUntil('2026-11-05', '2026-10-30')).toBe(6);
    expect(isWithinDays('2026-10-30', '2026-10-30', 14)).toBe(true);
    expect(isWithinDays('2026-11-13', '2026-10-30', 14)).toBe(true);
    expect(isWithinDays('2026-11-14', '2026-10-30', 14)).toBe(false);
    expect(isWithinDays('2026-10-29', '2026-10-30', 14)).toBe(false);
  });
});
