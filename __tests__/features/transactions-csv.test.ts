import type { Account, Category, Transaction } from '@/db/schema';
import { parseCsvRows } from '@/domain/csv';
import {
  centsToPlain,
  safeCell,
  transactionsToCsv,
  type CsvLabels,
} from '@/features/export/transactions-csv';

const labels: CsvLabels = {
  headers: {
    date: 'Date',
    account: 'Account',
    payee: 'Payee',
    amount: 'Amount',
    currency: 'Currency',
    type: 'Type',
    status: 'Status',
    category: 'Category',
    notes: 'Notes',
  },
  type: (t) => t.toUpperCase(),
  status: (s) => s,
  category: (c) => c.name,
};

const tx = (overrides: Partial<Transaction>): Transaction => ({
  id: 't',
  accountId: 'visa',
  date: '2026-10-03',
  postedDate: null,
  payee: 'Netflix',
  amountCents: -1699,
  type: 'purchase',
  status: 'posted',
  categoryId: 'sys-subscriptions',
  notes: null,
  recurringId: null,
  statementId: null,
  transferGroupId: null,
  importBatchId: null,
  dedupeHash: 'h',
  isReconciled: false,
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

const accounts = new Map([['visa', { id: 'visa', name: 'TD Visa', currency: 'CAD' } as Account]]);
const categories = new Map([
  ['sys-subscriptions', { id: 'sys-subscriptions', name: 'Subscriptions' } as Category],
]);

describe('transactionsToCsv', () => {
  it('writes a header and one row per transaction', () => {
    const csv = transactionsToCsv(
      [
        tx({}),
        tx({
          payee: 'Store, Inc.',
          amountCents: 250000,
          type: 'refund',
          categoryId: null,
          notes: 'Line "1"',
        }),
      ],
      { accounts, categories, labels },
    );
    expect(parseCsvRows(csv)).toEqual([
      ['Date', 'Account', 'Payee', 'Amount', 'Currency', 'Type', 'Status', 'Category', 'Notes'],
      [
        '2026-10-03',
        'TD Visa',
        'Netflix',
        '-16.99',
        'CAD',
        'PURCHASE',
        'posted',
        'Subscriptions',
        '',
      ],
      [
        '2026-10-03',
        'TD Visa',
        'Store, Inc.',
        '2500.00',
        'CAD',
        'REFUND',
        'posted',
        '',
        'Line "1"',
      ],
    ]);
  });

  it('neutralizes spreadsheet formulas in text but not in amounts', () => {
    const csv = transactionsToCsv([tx({ payee: '=HYPERLINK("x")', notes: '+1' })], {
      accounts,
      categories,
      labels,
    });
    const row = parseCsvRows(csv)[1];
    expect(row[2]).toBe(`'=HYPERLINK("x")`);
    expect(row[3]).toBe('-16.99');
    expect(row[8]).toBe("'+1");
  });

  it('copes with unknown accounts', () => {
    const csv = transactionsToCsv([tx({ accountId: 'gone' })], { accounts, categories, labels });
    expect(parseCsvRows(csv)[1].slice(1, 5)).toEqual(['', 'Netflix', '-16.99', '']);
  });
});

describe('helpers', () => {
  it('centsToPlain', () => {
    expect(centsToPlain(-1699)).toBe('-16.99');
    expect(centsToPlain(5)).toBe('0.05');
    expect(centsToPlain(0)).toBe('0.00');
  });

  it('safeCell', () => {
    expect(safeCell('@SUM')).toBe("'@SUM");
    expect(safeCell('-x')).toBe("'-x");
    expect(safeCell('Tim Hortons')).toBe('Tim Hortons');
  });
});
