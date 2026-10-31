/**
 * @jest-environment node
 */
import type { TransactionInput } from '@/db/repositories/transactions';
import { createTestDatabase } from '@/db/test-database';
import { buildTransferPair, parseSearchQuery } from '@/domain/transactions';

let t: ReturnType<typeof createTestDatabase>;
let visaId: string;
let chequingId: string;

beforeEach(() => {
  t = createTestDatabase();
  t.repos.categories.seedDefaults();
  visaId = t.repos.accounts.create({
    name: 'Visa',
    type: 'credit',
    creditLimitCents: 500000,
    openingBalanceCents: 0,
    openingBalanceDate: '2026-10-01',
  }).id;
  chequingId = t.repos.accounts.create({
    name: 'Chequing',
    type: 'debit',
    openingBalanceCents: 100000,
    openingBalanceDate: '2026-10-01',
  }).id;
});
afterEach(() => t.close());

function add(overrides: Partial<TransactionInput> = {}) {
  return t.repos.transactions.create({
    accountId: visaId,
    date: '2026-10-10',
    payee: 'Tim Hortons',
    amountCents: -450,
    type: 'purchase',
    status: 'posted',
    ...overrides,
  });
}

function addTransfer(amountCents = -25000) {
  const pair = buildTransferPair({
    self: { accountId: chequingId, accountType: 'debit', payee: 'Payment to Visa' },
    other: { accountId: visaId, accountType: 'credit', payee: 'Payment from Chequing' },
    amountCents,
    date: '2026-10-20',
    status: 'posted',
    categoryId: 'sys-transfers',
    notes: null,
    transferGroupId: 'group-1',
  });
  return t.repos.transactions.createTransfer(pair);
}

describe('transfers', () => {
  it('creates two linked rows that move both balances', () => {
    const [chq, visa] = addTransfer();
    expect(chq).toMatchObject({ accountId: chequingId, amountCents: -25000, type: 'transfer' });
    expect(visa).toMatchObject({ accountId: visaId, amountCents: 25000, type: 'payment' });
    expect(t.repos.transactions.counterpart(chq.id)?.id).toBe(visa.id);
    expect(t.repos.transactions.counterpart(visa.id)?.id).toBe(chq.id);

    const totals = t.repos.transactions.totalsByAccount();
    expect(totals.get(chequingId)?.postedCents).toBe(-25000);
    expect(totals.get(visaId)?.postedCents).toBe(25000);
  });

  it('rejects mismatched groups and same-account transfers', () => {
    const [a, b] = buildTransferPair({
      self: { accountId: chequingId, accountType: 'debit', payee: 'x' },
      other: { accountId: visaId, accountType: 'credit', payee: 'y' },
      amountCents: -100,
      date: '2026-10-20',
      status: 'posted',
      categoryId: null,
      notes: null,
      transferGroupId: 'g',
    });
    expect(() =>
      t.repos.transactions.createTransfer([a, { ...b, transferGroupId: 'other' }]),
    ).toThrow(/same transferGroupId/);
    expect(() => t.repos.transactions.createTransfer([a, { ...b, accountId: chequingId }])).toThrow(
      /two different accounts/,
    );
  });

  it('editing one side mirrors amount, date, status and notes to the other', () => {
    const [chq, visa] = addTransfer();
    t.repos.transactions.update(visa.id, {
      amountCents: 30000,
      date: '2026-10-21',
      notes: 'Paid early',
      payee: 'Visa payment',
    });
    const other = t.repos.transactions.getById(chq.id)!;
    expect(other).toMatchObject({
      amountCents: -30000,
      date: '2026-10-21',
      notes: 'Paid early',
      payee: 'Payment to Visa',
    });
  });

  it('deleting one side deletes both', () => {
    const [chq, visa] = addTransfer();
    t.repos.transactions.delete(chq.id);
    expect(t.repos.transactions.getById(chq.id)).toBeUndefined();
    expect(t.repos.transactions.getById(visa.id)).toBeUndefined();
  });

  it('a plain transaction has no counterpart and deletes alone', () => {
    const a = add();
    const b = add();
    expect(t.repos.transactions.counterpart(a.id)).toBeUndefined();
    t.repos.transactions.delete(a.id);
    expect(t.repos.transactions.getById(b.id)).toBeDefined();
    expect(t.repos.transactions.counterpart('missing')).toBeUndefined();
    expect(() => t.repos.transactions.delete('missing')).not.toThrow();
  });
});

describe('pending holds', () => {
  it('mark posted with the final amount', () => {
    const hold = add({ payee: 'Petro-Canada', amountCents: -100, status: 'pending' });
    const posted = t.repos.transactions.markPosted(hold.id, {
      amountCents: -5420,
      postedDate: '2026-10-12',
    });
    expect(posted).toMatchObject({
      status: 'posted',
      amountCents: -5420,
      postedDate: '2026-10-12',
    });
  });

  it('mark posted keeping the amount', () => {
    const hold = add({ amountCents: -2000, status: 'pending' });
    expect(
      t.repos.transactions.markPosted(hold.id, { postedDate: '2026-10-12' })?.amountCents,
    ).toBe(-2000);
  });

  it('void removes it from the totals', () => {
    const hold = add({ amountCents: -2000, status: 'pending' });
    expect(t.repos.transactions.totalsByAccount().get(visaId)?.pendingCents).toBe(-2000);
    t.repos.transactions.void(hold.id);
    expect(t.repos.transactions.getById(hold.id)?.status).toBe('void');
    expect(t.repos.transactions.totalsByAccount().get(visaId)?.pendingCents).toBe(0);
  });

  it('update of a missing id returns undefined', () => {
    expect(t.repos.transactions.update('missing', { notes: 'x' })).toBeUndefined();
  });
});

describe('search', () => {
  beforeEach(() => {
    add({ payee: 'Tim Hortons', amountCents: -450, date: '2026-10-05', categoryId: 'sys-dining' });
    add({ payee: 'Loblaws', amountCents: -5420, date: '2026-10-06', categoryId: 'sys-groceries' });
    add({
      payee: 'Paycheque',
      accountId: chequingId,
      amountCents: 250000,
      type: 'deposit',
      date: '2026-10-15',
      notes: 'October salary',
    });
    add({ payee: '100% Juice_Bar', amountCents: -800, date: '2026-10-07', status: 'pending' });
  });

  const search = (filters: Parameters<typeof t.repos.transactions.search>[0]) =>
    t.repos.transactions.search(filters).map((r) => r.payee);

  it('returns everything newest first with no filters', () => {
    expect(search({})).toEqual(['Paycheque', '100% Juice_Bar', 'Loblaws', 'Tim Hortons']);
  });

  it('matches payee and notes case-insensitively', () => {
    expect(search({ query: parseSearchQuery('tim') })).toEqual(['Tim Hortons']);
    expect(search({ query: parseSearchQuery('salary') })).toEqual(['Paycheque']);
  });

  it('matches an amount regardless of sign', () => {
    expect(search({ query: parseSearchQuery('54.20') })).toEqual(['Loblaws']);
  });

  it('treats % and _ literally', () => {
    expect(search({ query: parseSearchQuery('100%') })).toEqual(['100% Juice_Bar']);
    expect(search({ query: parseSearchQuery('e_b') })).toEqual(['100% Juice_Bar']);
  });

  it('filters by account, category, type, status and date range', () => {
    expect(search({ accountIds: [chequingId] })).toEqual(['Paycheque']);
    expect(search({ categoryIds: ['sys-dining', 'sys-groceries'] })).toEqual([
      'Loblaws',
      'Tim Hortons',
    ]);
    expect(search({ types: ['deposit'] })).toEqual(['Paycheque']);
    expect(search({ statuses: ['pending'] })).toEqual(['100% Juice_Bar']);
    expect(search({ from: '2026-10-06', to: '2026-10-07' })).toEqual(['100% Juice_Bar', 'Loblaws']);
  });

  it('respects the limit', () => {
    expect(search({ limit: 1 })).toEqual(['Paycheque']);
  });
});

describe('payee memory', () => {
  it('suggests previous payees, prefix matches and frequent ones first', () => {
    add({ payee: 'Tim Hortons' });
    add({ payee: 'TIM HORTONS' });
    add({ payee: 'Costco' });
    add({ payee: 'Uptime Gym' });
    const payees = t.repos.transactions.payeeSuggestions('tim').map((s) => s.payee);
    expect(payees).toHaveLength(2);
    expect(payees[0].toLowerCase()).toBe('tim hortons');
    expect(payees[1]).toBe('Uptime Gym');
    expect(t.repos.transactions.payeeSuggestions('tim')[0].uses).toBe(2);
  });

  it('with no text suggests the most used payees, skipping transfers', () => {
    add({ payee: 'Costco' });
    add({ payee: 'Costco' });
    add({ payee: 'Netflix' });
    addTransfer();
    expect(t.repos.transactions.payeeSuggestions('').map((s) => s.payee)).toEqual([
      'Costco',
      'Netflix',
    ]);
  });

  it('does not suggest exactly what was typed', () => {
    add({ payee: 'Costco' });
    expect(t.repos.transactions.payeeSuggestions('costco')).toEqual([]);
  });

  it('remembers the last account, type and category for a payee', () => {
    add({ payee: 'Costco', categoryId: 'sys-groceries', date: '2026-10-01' });
    add({ payee: 'costco', accountId: chequingId, categoryId: null, date: '2026-10-09' });
    expect(t.repos.transactions.payeeMemory('COSTCO ')).toEqual({
      accountId: chequingId,
      type: 'purchase',
      categoryId: 'sys-groceries',
    });
    expect(t.repos.transactions.payeeMemory('Nobody')).toBeUndefined();
  });
});

describe('categories', () => {
  it('counts transactions per category; deleting a custom one uncategorizes them', () => {
    const custom = t.repos.categories.create({ name: 'Pets', color: '#00695C' });
    const tx = add({ categoryId: custom.id });
    expect(t.repos.categories.countTransactions(custom.id)).toBe(1);
    t.repos.categories.delete(custom.id);
    expect(t.repos.transactions.getById(tx.id)?.categoryId).toBeNull();
  });
});

describe('spendingByCurrency', () => {
  it('nets purchases and refunds, skipping void, transfers, deposits and other dates', () => {
    add({ amountCents: -5000, date: '2026-10-05' });
    add({ amountCents: -1000, date: '2026-10-06', status: 'pending' });
    add({ amountCents: 1500, date: '2026-10-07', type: 'refund' });
    add({ amountCents: -9999, date: '2026-10-08', status: 'void' });
    add({ amountCents: -7000, date: '2026-09-30' });
    add({ accountId: chequingId, amountCents: 100000, type: 'deposit', date: '2026-10-09' });
    addTransfer();
    expect(
      t.repos.transactions.spendingByCurrency({ from: '2026-10-01', to: '2026-10-31' }),
    ).toEqual(new Map([['CAD', 4500]]));
  });

  it('groups by currency and leaves out archived accounts', () => {
    const usd = t.repos.accounts.create({
      name: 'US Visa',
      type: 'credit',
      currency: 'USD',
      openingBalanceDate: '2026-10-01',
    });
    add({ accountId: usd.id, amountCents: -2000 });
    add({ amountCents: -300 });
    const range = { from: '2026-10-01', to: '2026-10-31' };
    expect(t.repos.transactions.spendingByCurrency(range)).toEqual(
      new Map([
        ['CAD', 300],
        ['USD', 2000],
      ]),
    );
    t.repos.accounts.setArchived(usd.id, true);
    expect(t.repos.transactions.spendingByCurrency(range).has('USD')).toBe(false);
  });

  it('is empty with no spending', () => {
    expect(
      t.repos.transactions.spendingByCurrency({ from: '2026-10-01', to: '2026-10-31' }).size,
    ).toBe(0);
  });
});

describe('spendingByAccount', () => {
  it('nets spending per account, with the same rules as spendingByCurrency', () => {
    add({ amountCents: -5000, date: '2026-10-05' });
    add({ amountCents: 1500, date: '2026-10-07', type: 'refund' });
    add({ amountCents: -9999, date: '2026-10-08', status: 'void' });
    add({ accountId: chequingId, amountCents: -1200, date: '2026-10-09' });
    add({ accountId: chequingId, amountCents: 100000, type: 'deposit', date: '2026-10-09' });
    addTransfer();
    expect(
      t.repos.transactions.spendingByAccount({ from: '2026-10-01', to: '2026-10-31' }),
    ).toEqual(
      new Map([
        [visaId, 3500],
        [chequingId, 1200],
      ]),
    );
  });

  it('leaves out archived accounts', () => {
    add({ amountCents: -300 });
    t.repos.accounts.setArchived(visaId, true);
    expect(
      t.repos.transactions.spendingByAccount({ from: '2026-10-01', to: '2026-10-31' }).size,
    ).toBe(0);
  });
});
