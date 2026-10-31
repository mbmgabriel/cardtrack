import fs from 'fs';
import path from 'path';

import {
  applyMapping,
  columnCount,
  detectDateFormat,
  importedTransactionType,
  parseCsvAmount,
  parseCsvDate,
  parseCsvRows,
  payeeCategoryKey,
  type ColumnMapping,
} from '@/domain/csv';

const fixture = (name: string) =>
  parseCsvRows(fs.readFileSync(path.join(__dirname, '../fixtures', name), 'utf8'));

const base: ColumnMapping = {
  hasHeader: false,
  dateCol: 0,
  dateFormat: 'MM/DD/YYYY',
  payeeCol: 1,
  amountCol: null,
  debitCol: 2,
  creditCol: 3,
  invertSign: false,
};

describe('parseCsvRows', () => {
  it('handles CRLF, quoted commas and trailing empty cells', () => {
    const rows = fixture('td-visa.csv');
    expect(rows).toHaveLength(6);
    expect(rows[5]).toEqual(['10/20/2026', 'LOBLAWS, TORONTO', '54.20', '', '']);
    expect(columnCount(rows)).toBe(5);
  });

  it('strips a byte-order mark and skips blank lines', () => {
    expect(fixture('rbc-chequing.csv')[0][0]).toBe('Account Type');
    expect(parseCsvRows('a,b\n\n  \nc,d\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('returns nothing for empty text', () => {
    expect(parseCsvRows('')).toEqual([]);
    expect(columnCount([])).toBe(0);
  });
});

describe('parseCsvDate', () => {
  it.each([
    ['2026-10-03', 'YYYY-MM-DD', '2026-10-03'],
    ['2026/10/3', 'YYYY-MM-DD', '2026-10-03'],
    ['2026-10-03 14:22:01', 'YYYY-MM-DD', '2026-10-03'],
    ['10/3/2026', 'MM/DD/YYYY', '2026-10-03'],
    ['03/10/2026', 'DD/MM/YYYY', '2026-10-03'],
    ['20261003', 'YYYYMMDD', '2026-10-03'],
    ['03 Oct 2026', 'D MMM YYYY', '2026-10-03'],
    ['3-Oct-2026', 'D MMM YYYY', '2026-10-03'],
    ['Oct 3, 2026', 'D MMM YYYY', '2026-10-03'],
    ['3 oct. 2026', 'D MMM YYYY', '2026-10-03'],
    ['3 févr. 2026', 'D MMM YYYY', '2026-02-03'],
    ['15 août 2026', 'D MMM YYYY', '2026-08-15'],
  ] as const)('%s as %s', (value, format, expected) => {
    expect(parseCsvDate(value, format)).toBe(expected);
  });

  it.each([
    ['2026-02-30', 'YYYY-MM-DD'],
    ['13/01/2026', 'MM/DD/YYYY'],
    ['Date', 'MM/DD/YYYY'],
    ['2026103', 'YYYYMMDD'],
    ['3 Foo 2026', 'D MMM YYYY'],
    ['Foo 3, 2026', 'D MMM YYYY'],
    ['', 'YYYY-MM-DD'],
  ] as const)('rejects %s as %s', (value, format) => {
    expect(parseCsvDate(value, format)).toBeNull();
  });
});

describe('detectDateFormat', () => {
  it('finds the format that reads every sample', () => {
    expect(detectDateFormat(['10/3/2026', '10/25/2026'])).toBe('MM/DD/YYYY');
    expect(detectDateFormat(['25/10/2026', '3/10/2026'])).toBe('DD/MM/YYYY');
    expect(detectDateFormat(['20261002'])).toBe('YYYYMMDD');
    expect(detectDateFormat(['2026-10-02', ''])).toBe('YYYY-MM-DD');
    expect(detectDateFormat(['05 Oct 2026'])).toBe('D MMM YYYY');
  });

  it('prefers month-first when both read, and gives up on mixed or empty input', () => {
    expect(detectDateFormat(['03/10/2026'])).toBe('MM/DD/YYYY');
    expect(detectDateFormat(['2026-10-02', '10/2/2026'])).toBeNull();
    expect(detectDateFormat([])).toBeNull();
  });
});

describe('parseCsvAmount', () => {
  it('reads dot or comma decimals, signs and symbols', () => {
    expect(parseCsvAmount('1,234.56')).toBe(123456);
    expect(parseCsvAmount('-23.45')).toBe(-2345);
    expect(parseCsvAmount('$16.99')).toBe(1699);
    expect(parseCsvAmount('54,20')).toBe(5420);
    expect(parseCsvAmount('(10.00)')).toBe(-1000);
  });

  it('is null for blanks and text', () => {
    expect(parseCsvAmount('')).toBeNull();
    expect(parseCsvAmount('n/a')).toBeNull();
  });
});

describe('applyMapping', () => {
  it('TD-style debit/credit columns: charges negative, payments and refunds positive', () => {
    const { rows, problems } = applyMapping(fixture('td-visa.csv'), base);
    expect(problems).toEqual([]);
    expect(rows.map((r) => [r.line, r.date, r.payee, r.amountCents])).toEqual([
      [1, '2026-10-03', 'NETFLIX.COM', -1699],
      [2, '2026-10-05', 'TIM HORTONS #1234', -450],
      [3, '2026-10-05', 'TIM HORTONS #1234', -450],
      [4, '2026-10-12', 'PAYMENT - THANK YOU', 25000],
      [5, '2026-10-14', 'AMAZON.CA REFUND', 3210],
      [6, '2026-10-20', 'LOBLAWS, TORONTO', -5420],
    ]);
  });

  it('RBC-style header and signed amount column', () => {
    const { rows } = applyMapping(fixture('rbc-chequing.csv'), {
      ...base,
      hasHeader: true,
      dateCol: 2,
      payeeCol: 5,
      amountCol: 6,
      debitCol: null,
      creditCol: null,
    });
    expect(rows.map((r) => [r.date, r.payee, r.amountCents])).toEqual([
      ['2026-10-01', 'ACME CORP', 250000],
      ['2026-10-02', 'SHOPPERS DRUG MART', -2345],
      ['2026-10-15', 'TD VISA', -25000],
    ]);
  });

  it('reports preamble, header and total lines instead of guessing', () => {
    const { rows, problems } = applyMapping(fixture('bmo-with-preamble.csv'), {
      ...base,
      dateCol: 2,
      dateFormat: 'YYYYMMDD',
      payeeCol: 4,
      amountCol: 3,
      debitCol: null,
      creditCol: null,
    });
    expect(rows.map((r) => [r.line, r.amountCents, r.payee])).toEqual([
      [3, -4500, '[DN]PETRO-CANADA'],
      [4, 10000, '[CW]TRANSFER'],
    ]);
    expect(problems).toEqual([
      { line: 1, reason: 'date' },
      { line: 2, reason: 'date' },
      { line: 5, reason: 'date' },
    ]);
  });

  it('inverts signs for cards that export charges as positive', () => {
    const { rows } = applyMapping([['2026-10-01', 'Store', '12.00']], {
      ...base,
      dateFormat: 'YYYY-MM-DD',
      amountCol: 2,
      invertSign: true,
    });
    expect(rows[0].amountCents).toBe(-1200);
  });

  it('flags missing amounts and payees, and collapses spaces in payees', () => {
    const { rows, problems } = applyMapping(
      [
        ['2026-10-01', 'A', '', ''],
        ['2026-10-01', '', '5.00', ''],
        ['2026-10-01', '  Big   Store ', '', '0'],
      ],
      { ...base, dateFormat: 'YYYY-MM-DD' },
    );
    expect(problems).toEqual([
      { line: 1, reason: 'amount' },
      { line: 2, reason: 'payee' },
    ]);
    expect(rows).toEqual([{ line: 3, date: '2026-10-01', payee: 'Big Store', amountCents: 0 }]);
    expect(Object.is(rows[0].amountCents, 0)).toBe(true);
  });
});

describe('importedTransactionType', () => {
  it('classifies by sign, account and payee', () => {
    expect(importedTransactionType('credit', -100, 'Store')).toBe('purchase');
    expect(importedTransactionType('credit', 100, 'PAYMENT - THANK YOU')).toBe('payment');
    expect(importedTransactionType('credit', 100, 'Paiement reçu')).toBe('payment');
    expect(importedTransactionType('credit', 100, 'AMAZON.CA')).toBe('refund');
    expect(importedTransactionType('debit', 100, 'Payroll')).toBe('deposit');
  });
});

describe('payeeCategoryKey', () => {
  it('ignores case, punctuation and store numbers', () => {
    expect(payeeCategoryKey('TIM HORTONS #1234')).toBe('tim hortons');
    expect(payeeCategoryKey('Tim Hortons')).toBe('tim hortons');
    expect(payeeCategoryKey('7-Eleven')).toBe('eleven');
  });
});
