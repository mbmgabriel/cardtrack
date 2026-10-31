import type { Transaction } from '@/db/schema';
import {
  defaultTransactionFormValues,
  directionForType,
  needsDirection,
  toNewTransaction,
  toTransactionPatch,
  transactionFormSchema,
  transactionToFormValues,
  type FormAccount,
  type TransactionFormValues,
} from '@/features/transactions/transaction-form-schema';

const accounts = new Map<string, FormAccount>([
  ['visa', { id: 'visa', name: 'Visa', type: 'credit' }],
  ['chq', { id: 'chq', name: 'Chequing', type: 'debit' }],
  ['sav', { id: 'sav', name: 'Savings', type: 'savings' }],
]);

const labels = {
  to: (name: string, isPayment: boolean) => `${isPayment ? 'Payment' : 'Transfer'} to ${name}`,
  from: (name: string, isPayment: boolean) => `${isPayment ? 'Payment' : 'Transfer'} from ${name}`,
};

const ctx = { locale: 'en-CA', accounts, labels, newGroupId: () => 'g1' };

function values(overrides: Partial<TransactionFormValues> = {}): TransactionFormValues {
  return {
    ...defaultTransactionFormValues({ accountId: 'visa', today: '2026-10-20' }),
    amount: '54.20',
    payee: 'Loblaws',
    ...overrides,
  };
}

function errors(v: TransactionFormValues, locale = 'en-CA') {
  const result = transactionFormSchema(locale).safeParse(v);
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message]));
}

describe('transactionFormSchema', () => {
  it('accepts a normal purchase', () => {
    expect(errors(values())).toEqual({});
  });

  it('requires a positive amount', () => {
    expect(errors(values({ amount: '' })).amount).toBe('transactionForm.errors.amount');
    expect(errors(values({ amount: '0' })).amount).toBe('transactionForm.errors.amount');
    expect(errors(values({ amount: '-5' })).amount).toBe('transactionForm.errors.amount');
    expect(errors(values({ amount: 'abc' })).amount).toBe('transactionForm.errors.amount');
  });

  it('parses amounts in the locale', () => {
    expect(errors(values({ amount: '54,20' }), 'fr-CA')).toEqual({});
  });

  it('requires a payee unless it is a linked transfer', () => {
    expect(errors(values({ payee: ' ' })).payee).toBe('transactionForm.errors.payeeRequired');
    expect(errors(values({ payee: '', type: 'transfer', otherAccountId: 'chq' }))).toEqual({});
  });

  it('rejects a transfer to the same account', () => {
    expect(errors(values({ type: 'transfer', otherAccountId: 'visa' })).otherAccountId).toBe(
      'transactionForm.errors.sameAccount',
    );
  });

  it('requires an account and a valid date', () => {
    const e = errors(values({ accountId: '', date: '2026-02-30' }));
    expect(e.accountId).toBe('transactionForm.errors.accountRequired');
    expect(e.date).toBe('transactionForm.errors.date');
  });

  it('limits payee and notes length', () => {
    const e = errors(values({ payee: 'x'.repeat(101), notes: 'y'.repeat(501) }));
    expect(e.payee).toBe('transactionForm.errors.payeeTooLong');
    expect(e.notes).toBe('transactionForm.errors.notesTooLong');
  });
});

describe('toNewTransaction', () => {
  it('a purchase is negative; blank notes and category become null', () => {
    expect(toNewTransaction(values({ notes: '  ' }), ctx)).toEqual({
      kind: 'single',
      input: {
        accountId: 'visa',
        date: '2026-10-20',
        payee: 'Loblaws',
        amountCents: -5420,
        type: 'purchase',
        status: 'posted',
        categoryId: null,
        notes: null,
      },
    });
  });

  it('a refund is positive and keeps category and notes', () => {
    const result = toNewTransaction(
      values({ type: 'refund', categoryId: 'sys-groceries', notes: ' returned ' }),
      ctx,
    );
    expect(result).toMatchObject({
      kind: 'single',
      input: { amountCents: 5420, categoryId: 'sys-groceries', notes: 'returned' },
    });
  });

  it('an adjustment follows the chosen direction', () => {
    const result = toNewTransaction(values({ type: 'adjustment', direction: 'in' }), ctx);
    expect(result).toMatchObject({ input: { amountCents: 5420 } });
  });

  it('an unlinked payment is a single positive row', () => {
    const result = toNewTransaction(values({ type: 'payment' }), ctx);
    expect(result).toMatchObject({ kind: 'single', input: { amountCents: 5420, type: 'payment' } });
  });

  it('paying the Visa from chequing makes a linked pair with generated payees', () => {
    const result = toNewTransaction(
      values({
        accountId: 'chq',
        type: 'payment',
        direction: 'out',
        otherAccountId: 'visa',
        payee: '',
      }),
      ctx,
    );
    expect(result.kind).toBe('transfer');
    if (result.kind !== 'transfer') return;
    const [self, other] = result.pair;
    expect(self).toMatchObject({
      accountId: 'chq',
      amountCents: -5420,
      type: 'transfer',
      payee: 'Payment to Visa',
      categoryId: 'sys-transfers',
      transferGroupId: 'g1',
    });
    expect(other).toMatchObject({
      accountId: 'visa',
      amountCents: 5420,
      type: 'payment',
      payee: 'Payment from Chequing',
    });
  });

  it('entered on the Visa, a payment from chequing gives the same pair', () => {
    const result = toNewTransaction(
      values({ type: 'payment', direction: 'in', otherAccountId: 'chq', payee: 'My payment' }),
      ctx,
    );
    if (result.kind !== 'transfer') throw new Error('expected a transfer');
    expect(result.pair[0]).toMatchObject({
      accountId: 'visa',
      amountCents: 5420,
      payee: 'My payment',
    });
    expect(result.pair[1]).toMatchObject({
      accountId: 'chq',
      amountCents: -5420,
      payee: 'Payment to Visa',
    });
  });

  it('moving money into savings is a plain transfer', () => {
    const result = toNewTransaction(
      values({
        accountId: 'chq',
        type: 'transfer',
        direction: 'out',
        otherAccountId: 'sav',
        payee: '',
      }),
      ctx,
    );
    if (result.kind !== 'transfer') throw new Error('expected a transfer');
    expect(result.pair.map((r) => [r.payee, r.type])).toEqual([
      ['Transfer to Savings', 'transfer'],
      ['Transfer from Chequing', 'transfer'],
    ]);
  });

  it('falls back to a single row if the other account is unknown', () => {
    const result = toNewTransaction(values({ type: 'transfer', otherAccountId: 'gone' }), ctx);
    expect(result.kind).toBe('single');
  });
});

describe('editing', () => {
  const existing: Transaction = {
    id: 't1',
    accountId: 'visa',
    date: '2026-10-10',
    postedDate: null,
    payee: 'Petro-Canada',
    amountCents: -100,
    type: 'purchase',
    status: 'pending',
    categoryId: 'sys-gas-transit',
    notes: null,
    recurringId: null,
    statementId: null,
    transferGroupId: null,
    importBatchId: null,
    dedupeHash: 'h',
    isReconciled: false,
    createdAt: '',
    updatedAt: '',
  };

  it('round-trips through the form', () => {
    const v = transactionToFormValues(existing, 'en-CA');
    expect(v).toMatchObject({ amount: '1.00', direction: 'out', categoryId: 'sys-gas-transit' });
    expect(toTransactionPatch({ ...v, amount: '54.20' }, existing, 'en-CA')).toEqual({
      amountCents: -5420,
      payee: 'Petro-Canada',
      date: '2026-10-10',
      status: 'pending',
      categoryId: 'sys-gas-transit',
      notes: null,
      accountId: 'visa',
      type: 'purchase',
    });
  });

  it('a linked side keeps its account, type and direction', () => {
    const linked = {
      ...existing,
      amountCents: 25000,
      type: 'payment' as const,
      transferGroupId: 'g',
    };
    const v = transactionToFormValues(linked, 'en-CA', { accountId: 'chq' });
    expect(v.otherAccountId).toBe('chq');
    const patch = toTransactionPatch({ ...v, amount: '300', payee: ' ' }, linked, 'en-CA');
    expect(patch).toMatchObject({ amountCents: 30000, payee: 'Petro-Canada' });
    expect(patch).not.toHaveProperty('accountId');
    expect(patch).not.toHaveProperty('type');
  });
});

describe('direction helpers', () => {
  it('directionForType', () => {
    expect(directionForType('payment', 'credit', 'out')).toBe('in');
    expect(directionForType('payment', 'debit', 'in')).toBe('out');
    expect(directionForType('payment', undefined, 'out')).toBe('in');
    expect(directionForType('refund', 'debit', 'out')).toBe('in');
    expect(directionForType('transfer', 'debit', 'in')).toBe('in');
  });

  it('needsDirection', () => {
    expect(needsDirection({ type: 'purchase', otherAccountId: '' })).toBe(false);
    expect(needsDirection({ type: 'adjustment', otherAccountId: '' })).toBe(true);
    expect(needsDirection({ type: 'payment', otherAccountId: '' })).toBe(false);
    expect(needsDirection({ type: 'payment', otherAccountId: 'chq' })).toBe(true);
  });
});
