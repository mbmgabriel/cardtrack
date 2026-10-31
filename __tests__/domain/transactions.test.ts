import {
  buildTransferPair,
  directionFor,
  directionOf,
  groupByDate,
  isTransferType,
  mirrorTransferPatch,
  parseSearchQuery,
  runningBalances,
  signedAmountCents,
  transferSideType,
  TYPE_DIRECTION,
  type BalanceRow,
} from '@/domain/transactions';
import { TRANSACTION_TYPES } from '@/domain/types';

describe('signedAmountCents', () => {
  it.each([
    ['purchase', -5420],
    ['fee', -5420],
    ['interest', -5420],
    ['cash_advance', -5420],
    ['withdrawal', -5420],
    ['refund', 5420],
    ['payment', 5420],
    ['deposit', 5420],
  ] as const)('%s → %i', (type, expected) => {
    expect(signedAmountCents(type, 5420)).toBe(expected);
  });

  it('uses the chosen direction for transfers and adjustments', () => {
    expect(signedAmountCents('transfer', 100, 'out')).toBe(-100);
    expect(signedAmountCents('transfer', 100, 'in')).toBe(100);
    expect(signedAmountCents('adjustment', 100, 'in')).toBe(100);
    expect(signedAmountCents('adjustment', 100)).toBe(-100);
  });

  it('ignores the chosen direction when the type fixes it', () => {
    expect(signedAmountCents('purchase', 100, 'in')).toBe(-100);
    expect(signedAmountCents('refund', 100, 'out')).toBe(100);
  });

  it('treats the input as a magnitude and never returns -0', () => {
    expect(signedAmountCents('refund', -250)).toBe(250);
    expect(Object.is(signedAmountCents('purchase', 0), 0)).toBe(true);
  });

  it('covers every transaction type', () => {
    expect(Object.keys(TYPE_DIRECTION).sort()).toEqual([...TRANSACTION_TYPES].sort());
  });
});

describe('direction helpers', () => {
  it('directionFor returns the fixed direction or the chosen one', () => {
    expect(directionFor('purchase', 'in')).toBe('out');
    expect(directionFor('transfer', 'in')).toBe('in');
  });

  it('directionOf reads the sign', () => {
    expect(directionOf(-1)).toBe('out');
    expect(directionOf(0)).toBe('out');
    expect(directionOf(1)).toBe('in');
  });

  it('isTransferType', () => {
    expect(isTransferType('transfer')).toBe(true);
    expect(isTransferType('payment')).toBe(true);
    expect(isTransferType('purchase')).toBe(false);
  });
});

describe('transferSideType', () => {
  it('is a payment when money reaches a credit card or LOC', () => {
    expect(transferSideType('credit', 1000)).toBe('payment');
    expect(transferSideType('line_of_credit', 1000)).toBe('payment');
  });

  it('is a transfer otherwise', () => {
    expect(transferSideType('credit', -1000)).toBe('transfer');
    expect(transferSideType('debit', 1000)).toBe('transfer');
    expect(transferSideType('savings', -1000)).toBe('transfer');
  });
});

describe('buildTransferPair', () => {
  const base = {
    date: '2026-10-20',
    status: 'posted' as const,
    categoryId: 'sys-transfers',
    notes: null,
    transferGroupId: 'g1',
  };

  it('paying a Visa from chequing: chequing −, Visa + as a payment', () => {
    const [self, other] = buildTransferPair({
      ...base,
      self: { accountId: 'chq', accountType: 'debit', payee: 'Payment to Visa' },
      other: { accountId: 'visa', accountType: 'credit', payee: 'Payment from Chequing' },
      amountCents: -25000,
    });
    expect(self).toMatchObject({ accountId: 'chq', amountCents: -25000, type: 'transfer' });
    expect(other).toMatchObject({
      accountId: 'visa',
      amountCents: 25000,
      type: 'payment',
      payee: 'Payment from Chequing',
      transferGroupId: 'g1',
      date: '2026-10-20',
    });
  });

  it('entered from the card side gives the same result', () => {
    const [self, other] = buildTransferPair({
      ...base,
      self: { accountId: 'visa', accountType: 'credit', payee: 'Payment' },
      other: { accountId: 'chq', accountType: 'debit', payee: 'Visa payment' },
      amountCents: 25000,
    });
    expect(self).toMatchObject({ amountCents: 25000, type: 'payment' });
    expect(other).toMatchObject({ amountCents: -25000, type: 'transfer' });
  });

  it('does not produce -0 for a zero transfer', () => {
    const [, other] = buildTransferPair({
      ...base,
      self: { accountId: 'a', accountType: 'debit', payee: 'x' },
      other: { accountId: 'b', accountType: 'savings', payee: 'y' },
      amountCents: 0,
    });
    expect(Object.is(other.amountCents, 0)).toBe(true);
  });
});

describe('mirrorTransferPatch', () => {
  it('copies shared fields and flips the amount', () => {
    expect(
      mirrorTransferPatch({
        amountCents: -3000,
        date: '2026-10-21',
        postedDate: '2026-10-22',
        status: 'posted',
        notes: 'n',
        categoryId: null,
      }),
    ).toEqual({
      amountCents: 3000,
      date: '2026-10-21',
      postedDate: '2026-10-22',
      status: 'posted',
      notes: 'n',
      categoryId: null,
    });
  });

  it('leaves out fields that were not changed', () => {
    expect(mirrorTransferPatch({ status: 'void' })).toEqual({ status: 'void' });
    expect(mirrorTransferPatch({})).toEqual({});
  });

  it('does not produce -0', () => {
    expect(Object.is(mirrorTransferPatch({ amountCents: 0 }).amountCents, 0)).toBe(true);
  });
});

describe('runningBalances', () => {
  const rows: BalanceRow[] = [
    { id: 'pending', date: '2026-10-25', amountCents: -100, status: 'pending' },
    { id: 'c', date: '2026-10-20', amountCents: -2000, status: 'posted' },
    { id: 'void', date: '2026-10-19', amountCents: -9999, status: 'void' },
    { id: 'b', date: '2026-10-15', amountCents: 5000, status: 'posted' },
    { id: 'a', date: '2026-10-10', amountCents: -1000, status: 'posted' },
    { id: 'old', date: '2026-09-30', amountCents: -700, status: 'posted' },
  ];

  it('gives the balance after each posted row, newest first', () => {
    // Opening 10000 on 2026-10-01: after a = 9000, after b = 14000, after c = 12000.
    const result = runningBalances(rows, 12000, '2026-10-01');
    expect(result.get('c')).toBe(12000);
    expect(result.get('b')).toBe(14000);
    expect(result.get('a')).toBe(9000);
  });

  it('gives null for pending, void and pre-opening rows', () => {
    const result = runningBalances(rows, 12000, '2026-10-01');
    expect(result.get('pending')).toBeNull();
    expect(result.get('void')).toBeNull();
    expect(result.get('old')).toBeNull();
  });

  it('counts rows dated on the opening-balance date', () => {
    const result = runningBalances(
      [{ id: 'x', date: '2026-10-01', amountCents: -500, status: 'posted' }],
      -500,
      '2026-10-01',
    );
    expect(result.get('x')).toBe(-500);
  });

  it('handles an empty list', () => {
    expect(runningBalances([], 0, '2026-10-01').size).toBe(0);
  });
});

describe('groupByDate', () => {
  it('makes one section per date in order', () => {
    const rows = [
      { id: 1, date: '2026-10-20' },
      { id: 2, date: '2026-10-20' },
      { id: 3, date: '2026-10-18' },
    ];
    expect(groupByDate(rows)).toEqual([
      { date: '2026-10-20', data: [rows[0], rows[1]] },
      { date: '2026-10-18', data: [rows[2]] },
    ]);
  });

  it('returns no sections for no rows', () => {
    expect(groupByDate([])).toEqual([]);
  });
});

describe('parseSearchQuery', () => {
  it('searches text only when there are no digits', () => {
    expect(parseSearchQuery('  Tim Hortons ')).toEqual({ text: 'Tim Hortons', amountCents: null });
  });

  it('also matches an amount, ignoring sign', () => {
    expect(parseSearchQuery('54.20')).toEqual({ text: '54.20', amountCents: 5420 });
    expect(parseSearchQuery('-$54.20')).toEqual({ text: '-$54.20', amountCents: 5420 });
    expect(parseSearchQuery('54,20', 'fr-CA')).toEqual({ text: '54,20', amountCents: 5420 });
  });

  it('keeps text with digits that is not an amount', () => {
    expect(parseSearchQuery('Store 123 Main')).toEqual({
      text: 'Store 123 Main',
      amountCents: null,
    });
  });

  it('handles empty input', () => {
    expect(parseSearchQuery('   ')).toEqual({ text: '', amountCents: null });
  });
});
