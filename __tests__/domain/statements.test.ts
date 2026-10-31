import {
  amountPaidFor,
  isPaymentForPeriod,
  MAX_BACKFILL_CYCLES,
  missingCycles,
  owedAsOf,
  reconcile,
  summarizeStatement,
  type StatementFigures,
} from '@/domain/statements';

const visa = {
  statementDay: 15,
  dueDayOffset: 21,
  openingBalanceCents: -50000,
  openingBalanceDate: '2026-09-01',
};

describe('missingCycles', () => {
  it('creates every cycle from the opening balance through the current one', () => {
    // Day 15 / offset 21: the cycle ending Oct 15 is due Nov 5.
    expect(missingCycles(visa, new Set(), '2026-10-30')).toEqual([
      { start: '2026-08-16', end: '2026-09-15', dueDate: '2026-10-06' },
      { start: '2026-09-16', end: '2026-10-15', dueDate: '2026-11-05' },
      { start: '2026-10-16', end: '2026-11-15', dueDate: '2026-12-06' },
    ]);
  });

  it('skips cycles that already exist', () => {
    const result = missingCycles(visa, new Set(['2026-09-15', '2026-10-15']), '2026-10-30');
    expect(result.map((c) => c.end)).toEqual(['2026-11-15']);
  });

  it('back-fills at most a year of cycles', () => {
    const old = { ...visa, openingBalanceDate: '2020-01-01' };
    const result = missingCycles(old, new Set(), '2026-10-30');
    expect(result).toHaveLength(MAX_BACKFILL_CYCLES);
    expect(result[result.length - 1].end).toBe('2026-11-15');
  });

  it('uses the default 21-day offset and handles day 31', () => {
    const card = {
      ...visa,
      statementDay: 31,
      dueDayOffset: null,
      openingBalanceDate: '2026-10-30',
    };
    expect(missingCycles(card, new Set(), '2026-11-05')).toEqual([
      { start: '2026-10-01', end: '2026-10-31', dueDate: '2026-11-21' },
      { start: '2026-11-01', end: '2026-11-30', dueDate: '2026-12-21' },
    ]);
  });

  it('a future opening date gives just the current cycle', () => {
    expect(
      missingCycles({ ...visa, openingBalanceDate: '2027-01-01' }, new Set(), '2026-10-30'),
    ).toHaveLength(1);
  });
});

describe('owedAsOf', () => {
  const txs = [
    { date: '2026-08-20', amountCents: -9999, status: 'posted' as const },
    { date: '2026-09-10', amountCents: -2000, status: 'posted' as const },
    { date: '2026-09-15', amountCents: -1000, status: 'posted' as const },
    { date: '2026-09-15', amountCents: -500, status: 'pending' as const },
    { date: '2026-09-16', amountCents: -3000, status: 'posted' as const },
    { date: '2026-09-12', amountCents: 10000, status: 'void' as const },
  ];

  it('counts posted rows up to and including the date', () => {
    expect(owedAsOf(visa, txs, '2026-09-15')).toBe(53000);
    expect(owedAsOf(visa, txs, '2026-09-16')).toBe(56000);
  });

  it('is the opening balance before any transaction, and never -0', () => {
    expect(owedAsOf(visa, txs, '2026-09-01')).toBe(50000);
    expect(Object.is(owedAsOf({ ...visa, openingBalanceCents: 0 }, [], '2026-09-01'), 0)).toBe(
      true,
    );
  });
});

describe('summarizeStatement', () => {
  const s: StatementFigures = {
    periodEnd: '2026-10-15',
    dueDate: '2026-11-05',
    closingBalanceCents: 40000,
    minimumPaymentCents: 1200,
    amountPaidCents: 0,
  };

  it('is open until the cycle closes', () => {
    expect(summarizeStatement(s, 40000, '2026-10-15').status).toBe('open');
  });

  it('is due after closing, overdue after the due date without the minimum', () => {
    expect(summarizeStatement(s, 40000, '2026-10-16')).toMatchObject({
      status: 'due',
      balanceDueCents: 40000,
      minimumDueCents: 1200,
      remainingCents: 40000,
      minimumMet: false,
      differenceCents: 0,
    });
    expect(summarizeStatement(s, 40000, '2026-11-05').status).toBe('due');
    expect(summarizeStatement(s, 40000, '2026-11-06').status).toBe('overdue');
  });

  it('paying the minimum avoids overdue; paying the balance is paid', () => {
    const minimum = summarizeStatement({ ...s, amountPaidCents: 1200 }, 40000, '2026-11-06');
    expect(minimum).toMatchObject({ status: 'due', minimumMet: true, remainingCents: 38800 });
    const full = summarizeStatement({ ...s, amountPaidCents: 40000 }, 40000, '2026-10-20');
    expect(full).toMatchObject({ status: 'paid', paidInFull: true, remainingCents: 0 });
  });

  it('uses the computed balance until one is entered', () => {
    const noEntry = { ...s, closingBalanceCents: null, minimumPaymentCents: null };
    expect(summarizeStatement(noEntry, 25000, '2026-11-06')).toMatchObject({
      status: 'overdue',
      balanceDueCents: 25000,
      minimumDueCents: 25000,
      differenceCents: null,
    });
  });

  it('highlights a difference between entered and computed', () => {
    expect(summarizeStatement(s, 39000, '2026-10-20').differenceCents).toBe(1000);
  });

  it('nothing owed (or a credit balance) counts as paid', () => {
    const credit = { ...s, closingBalanceCents: -500, minimumPaymentCents: null };
    expect(summarizeStatement(credit, -500, '2026-12-01')).toMatchObject({
      status: 'paid',
      minimumDueCents: 0,
      remainingCents: 0,
    });
  });
});

describe('reconcile', () => {
  const txs = [
    { amountCents: -2000, isReconciled: true },
    { amountCents: -1000, isReconciled: true },
    { amountCents: 500, isReconciled: true },
    { amountCents: -700, isReconciled: false },
  ];

  it('previous closing plus ticked rows equals the statement → reconciled', () => {
    expect(reconcile(10000, txs, 12500)).toEqual({
      clearedCents: 12500,
      differenceCents: 0,
      isReconciled: true,
      checkedCount: 3,
    });
  });

  it('shows what is left to find', () => {
    expect(reconcile(10000, txs, 13200)).toMatchObject({
      differenceCents: 700,
      isReconciled: false,
    });
  });

  it('cannot reconcile without a closing balance', () => {
    expect(reconcile(10000, txs, null)).toMatchObject({
      differenceCents: null,
      isReconciled: false,
    });
  });

  it('never returns -0', () => {
    expect(Object.is(reconcile(0, [], 0).clearedCents, 0)).toBe(true);
  });
});

describe('isPaymentForPeriod', () => {
  const period = { periodEnd: '2026-10-15', dueDate: '2026-11-05' };
  const pay = {
    date: '2026-10-20',
    amountCents: 25000,
    type: 'payment' as const,
    status: 'posted' as const,
    statementId: null,
  };

  it('matches payments between closing and due date', () => {
    expect(isPaymentForPeriod(pay, period)).toBe(true);
    expect(isPaymentForPeriod({ ...pay, date: '2026-11-05' }, period)).toBe(true);
  });

  it('skips other dates, refunds, voids and already-linked payments', () => {
    expect(isPaymentForPeriod({ ...pay, date: '2026-10-15' }, period)).toBe(false);
    expect(isPaymentForPeriod({ ...pay, date: '2026-11-06' }, period)).toBe(false);
    expect(isPaymentForPeriod({ ...pay, type: 'refund' }, period)).toBe(false);
    expect(isPaymentForPeriod({ ...pay, status: 'void' }, period)).toBe(false);
    expect(isPaymentForPeriod({ ...pay, statementId: 's' }, period)).toBe(false);
    expect(isPaymentForPeriod({ ...pay, amountCents: -1 }, period)).toBe(false);
  });
});

describe('amountPaidFor', () => {
  it('sums linked, non-void payments', () => {
    expect(
      amountPaidFor('s1', [
        { statementId: 's1', status: 'posted', amountCents: 10000 },
        { statementId: 's1', status: 'pending', amountCents: 2000 },
        { statementId: 's1', status: 'void', amountCents: 5000 },
        { statementId: 's2', status: 'posted', amountCents: 7000 },
        { statementId: null, status: 'posted', amountCents: 1 },
      ]),
    ).toBe(12000);
  });
});
