/**
 * @jest-environment node
 */
import {
  BACKUP_FORMAT,
  createBackupService,
  parseBackup,
  SCHEMA_VERSION,
  upgradeBackup,
} from '@/db/backup';
import { createTestDatabase } from '@/db/test-database';

let a: ReturnType<typeof createTestDatabase>;
let b: ReturnType<typeof createTestDatabase>;

beforeEach(() => {
  a = createTestDatabase();
  b = createTestDatabase();
});
afterEach(() => {
  a.close();
  b.close();
});

/** A little of everything, including links between tables. */
function fill() {
  a.repos.categories.seedDefaults();
  const pets = a.repos.categories.create({ name: 'Pets', color: '#00695C' });
  const visa = a.repos.accounts.create({
    name: 'Visa',
    type: 'credit',
    creditLimitCents: 500000,
    openingBalanceCents: -20000,
    openingBalanceDate: '2026-09-20',
    statementDay: 15,
  });
  const chq = a.repos.accounts.create({
    name: 'Chequing',
    type: 'debit',
    openingBalanceDate: '2026-09-20',
  });
  a.repos.transactions.create({
    accountId: visa.id,
    date: '2026-10-01',
    payee: 'Vet',
    amountCents: -9000,
    type: 'purchase',
    categoryId: pets.id,
  });
  a.repos.transactions.createTransfer([
    {
      accountId: chq.id,
      date: '2026-10-20',
      payee: 'To Visa',
      amountCents: -5000,
      type: 'transfer',
      transferGroupId: 'g',
    },
    {
      accountId: visa.id,
      date: '2026-10-20',
      payee: 'From Chq',
      amountCents: 5000,
      type: 'payment',
      transferGroupId: 'g',
    },
  ]);
  a.repos.recurring.create({
    accountId: visa.id,
    payee: 'Netflix',
    amountCents: -1699,
    frequency: 'monthly',
    anchorDate: '2026-10-03',
    nextDate: '2026-11-03',
  });
  a.repos.installments.create({
    accountId: visa.id,
    description: 'Laptop',
    principalCents: 120000,
    months: 12,
    monthlyCents: 10000,
    firstPaymentDate: '2026-09-15',
  });
  a.repos.statements.sync('2026-10-30');
  a.repos.imports.create({
    accountId: visa.id,
    fileName: 'td.csv',
    skippedDuplicates: 1,
    rows: [
      {
        accountId: visa.id,
        date: '2026-10-05',
        payee: 'Coffee',
        amountCents: -450,
        type: 'purchase',
      },
    ],
  });
  a.repos.csvMappings.save('TD', 'TD', {
    hasHeader: false,
    dateCol: 0,
    dateFormat: 'MM/DD/YYYY',
    payeeCol: 1,
    amountCol: null,
    debitCol: 2,
    creditCol: 3,
    invertSign: false,
  });
  a.repos.settings.set('reminders_enabled', true);
}

describe('backup and restore', () => {
  it('round-trips every table exactly', () => {
    fill();
    const backup = createBackupService(a.db).exportAll();
    expect(backup).toMatchObject({ format: BACKUP_FORMAT, schemaVersion: SCHEMA_VERSION });

    const parsed = parseBackup(JSON.stringify(backup));
    if (!parsed.ok) throw new Error(parsed.problem);
    const target = createBackupService(b.db);
    target.restore(parsed.backup);

    const again = target.exportAll();
    expect(again.tables).toEqual(backup.tables);
    expect(target.counts(again)).toMatchObject({
      accounts: 2,
      transactions: 4,
      recurringRules: 1,
      installmentPlans: 1,
      importBatches: 1,
      csvMappings: 1,
      settings: 1,
    });
  });

  it('replaces whatever was there before', () => {
    fill();
    const backup = createBackupService(a.db).exportAll();
    b.repos.accounts.create({ name: 'Old', type: 'cash', openingBalanceDate: '2026-01-01' });
    createBackupService(b.db).restore(backup);
    expect(
      b.repos.accounts
        .list()
        .map((x) => x.name)
        .sort(),
    ).toEqual(['Chequing', 'Visa']);
  });

  it('a bad row rolls back the whole restore, keeping the old data', () => {
    b.repos.accounts.create({ name: 'Keep me', type: 'cash', openingBalanceDate: '2026-01-01' });
    fill();
    const backup = createBackupService(a.db).exportAll();
    // A transaction pointing at an account that isn't in the file.
    backup.tables.transactions.push({
      ...backup.tables.transactions[0],
      id: 'x',
      accountId: 'nope',
    });
    expect(() => createBackupService(b.db).restore(backup)).toThrow();
    expect(b.repos.accounts.list().map((x) => x.name)).toEqual(['Keep me']);
  });

  it('restores child categories after their parents', () => {
    a.repos.categories.seedDefaults();
    const parent = a.repos.categories.create({ name: 'Car', color: '#00695C' });
    a.repos.categories.create({ name: 'Fuel', color: '#00695C', parentId: parent.id });
    const backup = createBackupService(a.db).exportAll();
    backup.tables.categories.reverse();
    createBackupService(b.db).restore(backup);
    expect(b.repos.categories.list()).toHaveLength(18);
  });
});

describe('parseBackup', () => {
  const valid = () => createBackupService(a.db).exportAll();

  it('rejects text that is not a backup', () => {
    expect(parseBackup('nope')).toEqual({ ok: false, problem: 'notJson' });
    expect(parseBackup('{"format":"other"}')).toEqual({ ok: false, problem: 'notBackup' });
    expect(parseBackup(JSON.stringify({ ...valid(), schemaVersion: 'x' }))).toEqual({
      ok: false,
      problem: 'notBackup',
    });
  });

  it('rejects backups from a newer app', () => {
    expect(parseBackup(JSON.stringify({ ...valid(), schemaVersion: SCHEMA_VERSION + 1 }))).toEqual({
      ok: false,
      problem: 'newerVersion',
    });
  });

  it('rejects missing tables and non-integer money', () => {
    const missing = valid();
    delete (missing.tables as Partial<typeof missing.tables>).statements;
    expect(parseBackup(JSON.stringify(missing))).toEqual({ ok: false, problem: 'damaged' });

    fill();
    const floaty = valid();
    floaty.tables.transactions[0].amountCents = 16.99;
    expect(parseBackup(JSON.stringify(floaty))).toEqual({ ok: false, problem: 'damaged' });
  });

  it('accepts a backup from before a table existed, starting it empty', () => {
    fill();
    const old = valid();
    delete (old.tables as Partial<typeof old.tables>).installmentPlans;
    const parsed = parseBackup(JSON.stringify({ ...old, schemaVersion: SCHEMA_VERSION - 1 }));
    if (!parsed.ok) throw new Error(parsed.problem);
    expect(parsed.backup.tables.installmentPlans).toEqual([]);
    expect(parsed.backup.tables.accounts).toHaveLength(2);
  });

  it('upgrades older versions to the current one', () => {
    const old = { ...valid(), schemaVersion: 1 };
    expect(upgradeBackup(old).schemaVersion).toBe(SCHEMA_VERSION);
  });
});
