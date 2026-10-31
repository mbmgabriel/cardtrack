/**
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';

import { createTestDatabase } from '@/db/test-database';
import { applyMapping, parseCsvRows, type ColumnMapping } from '@/domain/csv';
import { planImport, toImportInput } from '@/features/import/plan-import';

let t: ReturnType<typeof createTestDatabase>;
let visaId: string;

const tdMapping: ColumnMapping = {
  hasHeader: false,
  dateCol: 0,
  dateFormat: 'MM/DD/YYYY',
  payeeCol: 1,
  amountCol: null,
  debitCol: 2,
  creditCol: 3,
  invertSign: false,
};

beforeEach(() => {
  t = createTestDatabase();
  t.repos.categories.seedDefaults();
  visaId = t.repos.accounts.create({
    name: 'TD Visa',
    institution: 'TD',
    type: 'credit',
    openingBalanceDate: '2026-10-01',
  }).id;
});
afterEach(() => t.close());

/** The whole wizard without the UI: read, map, plan, insert. */
function importFile(name: string) {
  const text = fs.readFileSync(path.join(__dirname, '../fixtures', name), 'utf8');
  const { rows } = applyMapping(parseCsvRows(text), tdMapping);
  const plan = planImport(rows, {
    accountId: visaId,
    accountType: 'credit',
    existingHashes: t.repos.transactions.dedupeHashes(visaId),
    categoryMemory: t.repos.transactions.categoryMemory(),
  });
  const batch = t.repos.imports.create({
    accountId: visaId,
    fileName: name,
    skippedDuplicates: plan.duplicates.length,
    rows: plan.fresh.map((r) => toImportInput(r, visaId, r.categoryId)),
  });
  return { plan, batch };
}

describe('CSV import', () => {
  it('importing the same file twice adds zero duplicates (PLAN.md Phase 7 "done when")', () => {
    const first = importFile('td-visa.csv');
    expect(first.plan.fresh).toHaveLength(6);
    expect(first.batch).toMatchObject({
      rowCount: 6,
      skippedDuplicates: 0,
      fileName: 'td-visa.csv',
    });

    const second = importFile('td-visa.csv');
    expect(second.plan.fresh).toHaveLength(0);
    expect(second.plan.duplicates).toHaveLength(6);
    expect(second.batch).toMatchObject({ rowCount: 0, skippedDuplicates: 6 });
    expect(t.repos.transactions.listByAccount(visaId)).toHaveLength(6);
  });

  it('keeps both identical coffees the first time', () => {
    importFile('td-visa.csv');
    const coffees = t.repos.transactions
      .listByAccount(visaId)
      .filter((r) => r.payee === 'TIM HORTONS #1234');
    expect(coffees).toHaveLength(2);
  });

  it('skips rows already entered by hand', () => {
    t.repos.transactions.create({
      accountId: visaId,
      date: '2026-10-03',
      payee: 'Netflix.com',
      amountCents: -1699,
      type: 'purchase',
    });
    expect(importFile('td-visa.csv').plan.duplicates.map((r) => r.payee)).toEqual(['NETFLIX.COM']);
  });

  it('sets types and auto-categorizes from payee history', () => {
    t.repos.transactions.create({
      accountId: visaId,
      date: '2026-09-01',
      payee: 'Tim Hortons',
      amountCents: -300,
      type: 'purchase',
      categoryId: 'sys-dining',
    });
    const { plan } = importFile('td-visa.csv');
    const byPayee = new Map(plan.fresh.map((r) => [r.payee, r]));
    expect(byPayee.get('TIM HORTONS #1234')).toMatchObject({
      type: 'purchase',
      categoryId: 'sys-dining',
    });
    expect(byPayee.get('PAYMENT - THANK YOU')?.type).toBe('payment');
    expect(byPayee.get('AMAZON.CA REFUND')?.type).toBe('refund');
    expect(byPayee.get('NETFLIX.COM')?.categoryId).toBeNull();
  });

  it('undo removes exactly that import', () => {
    t.repos.transactions.create({
      accountId: visaId,
      date: '2026-10-01',
      payee: 'Manual',
      amountCents: -100,
      type: 'purchase',
    });
    const { batch } = importFile('td-visa.csv');
    expect(t.repos.imports.listByAccount(visaId).map((b) => b.id)).toEqual([batch.id]);
    expect(t.repos.imports.countTransactions(batch.id)).toBe(6);
    t.repos.imports.undo(batch.id);
    expect(t.repos.transactions.listByAccount(visaId).map((r) => r.payee)).toEqual(['Manual']);
    expect(t.repos.imports.getById(batch.id)).toBeUndefined();
    // After undo the same file imports fully again.
    expect(importFile('td-visa.csv').plan.fresh).toHaveLength(6);
  });
});

describe('saved mappings', () => {
  it('saves one mapping per institution, case-insensitively', () => {
    expect(t.repos.csvMappings.findForInstitution('TD')).toBeUndefined();
    t.repos.csvMappings.save('TD', 'TD credit card', tdMapping);
    t.repos.csvMappings.save('td ', 'TD credit card', { ...tdMapping, invertSign: true });
    expect(t.repos.csvMappings.findForInstitution('Td')).toEqual({
      ...tdMapping,
      invertSign: true,
      name: 'TD credit card',
    });
    expect(t.sqlite.prepare('select count(*) as n from csv_mappings').get()).toEqual({ n: 1 });
  });

  it('round-trips a single-amount mapping and ignores a blank institution', () => {
    const single = { ...tdMapping, amountCol: 6, debitCol: null, creditCol: null, hasHeader: true };
    t.repos.csvMappings.save('RBC', 'RBC', single);
    expect(t.repos.csvMappings.findForInstitution('RBC')).toMatchObject(single);
    t.repos.csvMappings.save('  ', 'x', single);
    expect(t.repos.csvMappings.findForInstitution('')).toBeUndefined();
  });
});
