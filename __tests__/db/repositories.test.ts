/**
 * @jest-environment node
 */
import { summarizeAccount, totalsFromTransactions } from '@/domain/balances';
import { computeDedupeHash } from '@/domain/dedupe';
import { DEFAULT_CATEGORIES } from '@/db/repositories/categories';
import type { AccountInput } from '@/db/repositories/accounts';
import { SETTINGS_DEFAULTS } from '@/db/repositories/settings';
import { createTestDatabase } from '@/db/test-database';

let t: ReturnType<typeof createTestDatabase>;
beforeEach(() => {
  t = createTestDatabase();
});
afterEach(() => t.close());

const visaInput: AccountInput = {
  name: 'TD Aeroplan Visa',
  institution: 'TD',
  type: 'credit',
  network: 'visa',
  last4: '1234',
  creditLimitCents: 500000,
  openingBalanceCents: -50000,
  openingBalanceDate: '2026-10-01',
  statementDay: 15,
  dueDayOffset: 21,
  interestRateBps: 1999,
};

const chequingInput: AccountInput = {
  name: 'Chequing',
  institution: 'RBC',
  type: 'debit',
  openingBalanceCents: 200000,
  openingBalanceDate: '2026-10-01',
};

describe('migrations', () => {
  it('create every table from PLAN.md §4', () => {
    const tables = t.sqlite
      .prepare(
        "select name from sqlite_master where type = 'table' and name not like '\\_\\_%' escape '\\' and name != 'sqlite_sequence' order by name",
      )
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toEqual([
      'accounts',
      'categories',
      'csv_mappings',
      'import_batches',
      'installment_plans',
      'recurring_rules',
      'settings',
      'statements',
      'transactions',
    ]);
  });

  it('create the transaction indexes', () => {
    const indexes = t.sqlite
      .prepare("select name from sqlite_master where type = 'index' and tbl_name = 'transactions'")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(indexes).toEqual(
      expect.arrayContaining([
        'transactions_account_date_idx',
        'transactions_category_idx',
        'transactions_status_idx',
        'transactions_dedupe_idx',
      ]),
    );
  });
});

describe('accounts repository', () => {
  it('creates with defaults and increasing sort order', () => {
    const visa = t.repos.accounts.create(visaInput);
    const chequing = t.repos.accounts.create(chequingInput);
    expect(visa.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(visa.currency).toBe('CAD');
    expect(visa.isArchived).toBe(false);
    expect(visa.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect([visa.sortOrder, chequing.sortOrder]).toEqual([0, 1]);
  });

  it('never accepts more than the last 4 digits', () => {
    expect(() => t.repos.accounts.create({ ...visaInput, last4: '4111111111111111' })).toThrow(
      /last4/,
    );
    const visa = t.repos.accounts.create(visaInput);
    expect(() => t.repos.accounts.update(visa.id, { last4: '12' })).toThrow(/last4/);
  });

  it('validates money and calendar fields', () => {
    expect(() => t.repos.accounts.create({ ...visaInput, openingBalanceCents: 10.5 })).toThrow();
    expect(() => t.repos.accounts.create({ ...visaInput, creditLimitCents: -1 })).toThrow();
    expect(() => t.repos.accounts.create({ ...visaInput, statementDay: 32 })).toThrow();
    expect(() => t.repos.accounts.create({ ...visaInput, dueDayOffset: -1 })).toThrow();
    expect(() =>
      t.repos.accounts.create({ ...visaInput, openingBalanceDate: '2026-02-30' }),
    ).toThrow();
  });

  it('archives, lists and reorders', () => {
    const visa = t.repos.accounts.create(visaInput);
    const chequing = t.repos.accounts.create(chequingInput);
    t.repos.accounts.reorder([chequing.id, visa.id]);
    expect(t.repos.accounts.list().map((a) => a.name)).toEqual(['Chequing', 'TD Aeroplan Visa']);

    t.repos.accounts.setArchived(visa.id, true);
    expect(t.repos.accounts.list().map((a) => a.id)).toEqual([chequing.id]);
    expect(t.repos.accounts.list({ includeArchived: true })).toHaveLength(2);
  });

  it('updates and bumps updated_at', () => {
    const visa = t.repos.accounts.create(visaInput);
    const updated = t.repos.accounts.update(visa.id, { name: 'Renamed' })!;
    expect(updated.name).toBe('Renamed');
    expect(updated.updatedAt >= visa.updatedAt).toBe(true);
  });

  it('delete cascades to transactions, rules and statements', () => {
    const visa = t.repos.accounts.create(visaInput);
    t.repos.transactions.createMany([
      { accountId: visa.id, date: '2026-10-02', payee: 'A', amountCents: -100, type: 'purchase' },
      { accountId: visa.id, date: '2026-10-03', payee: 'B', amountCents: -200, type: 'purchase' },
    ]);
    t.repos.recurring.create({
      accountId: visa.id,
      payee: 'Netflix',
      amountCents: -1699,
      frequency: 'monthly',
      anchorDate: '2026-10-05',
      nextDate: '2026-11-05',
    });
    t.repos.statements.create({
      accountId: visa.id,
      periodStart: '2026-09-16',
      periodEnd: '2026-10-15',
      dueDate: '2026-11-05',
    });
    expect(t.repos.accounts.countTransactions(visa.id)).toBe(2);

    t.repos.accounts.delete(visa.id);
    expect(t.repos.accounts.getById(visa.id)).toBeUndefined();
    expect(t.repos.accounts.countTransactions(visa.id)).toBe(0);
    expect(t.repos.recurring.listByAccount(visa.id)).toEqual([]);
    expect(t.repos.statements.listByAccount(visa.id)).toEqual([]);
  });
});

describe('transactions repository', () => {
  it('computes the dedupe hash on create and update', () => {
    const visa = t.repos.accounts.create(visaInput);
    const input = {
      accountId: visa.id,
      date: '2026-10-02',
      payee: 'Tim Hortons',
      amountCents: -450,
      type: 'purchase' as const,
    };
    const tx = t.repos.transactions.create(input);
    expect(tx.status).toBe('posted');
    expect(tx.dedupeHash).toBe(computeDedupeHash(input));

    const updated = t.repos.transactions.update(tx.id, { amountCents: -500 })!;
    expect(updated.dedupeHash).toBe(computeDedupeHash({ ...input, amountCents: -500 }));
    expect(t.repos.transactions.dedupeHashes(visa.id)).toEqual([updated.dedupeHash]);
  });

  it('rejects float amounts and bad dates', () => {
    const visa = t.repos.accounts.create(visaInput);
    const base = { accountId: visa.id, date: '2026-10-02', payee: 'X', type: 'purchase' as const };
    expect(() => t.repos.transactions.create({ ...base, amountCents: -4.5 })).toThrow();
    expect(() =>
      t.repos.transactions.create({ ...base, amountCents: 1, date: '10/02/2026' }),
    ).toThrow();
    expect(() =>
      t.repos.transactions.create({ ...base, amountCents: 1, postedDate: 'tomorrow' }),
    ).toThrow();
  });

  it('createMany is atomic', () => {
    const visa = t.repos.accounts.create(visaInput);
    const good = {
      accountId: visa.id,
      date: '2026-10-02',
      payee: 'A',
      amountCents: -100,
      type: 'purchase' as const,
    };
    expect(() =>
      t.repos.transactions.createMany([good, { ...good, accountId: 'missing-account' }]),
    ).toThrow(/FOREIGN KEY/);
    expect(t.repos.accounts.countTransactions(visa.id)).toBe(0);
  });

  it('lists newest first and filters by status', () => {
    const visa = t.repos.accounts.create(visaInput);
    const base = { accountId: visa.id, payee: 'P', amountCents: -100, type: 'purchase' as const };
    t.repos.transactions.create({ ...base, date: '2026-10-01' });
    t.repos.transactions.create({ ...base, date: '2026-10-03', status: 'pending' });
    t.repos.transactions.create({ ...base, date: '2026-10-02' });
    expect(t.repos.transactions.listByAccount(visa.id).map((x) => x.date)).toEqual([
      '2026-10-03',
      '2026-10-02',
      '2026-10-01',
    ]);
    expect(t.repos.transactions.listByAccount(visa.id, { status: 'pending' })).toHaveLength(1);
  });

  it('totals feed the domain balance rules end to end', () => {
    const visa = t.repos.accounts.create(visaInput);
    const chequing = t.repos.accounts.create(chequingInput);
    const tx = (
      accountId: string,
      amountCents: number,
      status: 'posted' | 'pending' | 'void' = 'posted',
    ) => ({
      accountId,
      date: '2026-10-05',
      payee: 'P',
      amountCents,
      type: 'purchase' as const,
      status,
    });
    t.repos.transactions.createMany([
      tx(visa.id, -12000), // purchase
      tx(visa.id, 2000), // refund
      tx(visa.id, 10000), // payment
      tx(visa.id, -100, 'pending'), // gas hold
      tx(visa.id, -99999, 'void'),
      tx(chequing.id, -10000), // payment to visa
    ]);

    const totals = t.repos.transactions.totalsByAccount();
    expect(totals.get(visa.id)).toEqual({ postedCents: 0, pendingCents: -100 });

    const summary = summarizeAccount(visa, totals.get(visa.id)!);
    expect(summary.balanceCents).toBe(50000);
    expect(summary.availableCreditCents).toBe(449900);
    expect(summarizeAccount(chequing, totals.get(chequing.id)!).balanceCents).toBe(190000);
  });

  it('totals ignore anything dated before the opening-balance date (SQL matches domain)', () => {
    const visa = t.repos.accounts.create(visaInput); // opening balance as of 2026-10-01
    const rows = [
      { date: '2026-09-15', amountCents: -7000, status: 'posted' as const }, // already in opening
      { date: '2026-09-30', amountCents: -300, status: 'pending' as const },
      { date: '2026-10-01', amountCents: -2000, status: 'posted' as const }, // same day counts
      { date: '2026-10-01', amountCents: -100, status: 'pending' as const },
    ];
    t.repos.transactions.createMany(
      rows.map((r) => ({ ...r, accountId: visa.id, payee: 'P', type: 'purchase' as const })),
    );

    const fromSql = t.repos.transactions.totalsByAccount().get(visa.id);
    expect(fromSql).toEqual({ postedCents: -2000, pendingCents: -100 });
    expect(fromSql).toEqual(totalsFromTransactions(rows, visaInput.openingBalanceDate));
    expect(summarizeAccount(visa, fromSql!).balanceCents).toBe(52000); // $500 + $20, not + $70

    // Moving the opening date earlier brings the older rows back in.
    t.repos.accounts.update(visa.id, { openingBalanceDate: '2026-09-01' });
    expect(t.repos.transactions.totalsByAccount().get(visa.id)).toEqual({
      postedCents: -9000,
      pendingCents: -400,
    });
  });

  it('deletes', () => {
    const visa = t.repos.accounts.create(visaInput);
    const tx = t.repos.transactions.create({
      accountId: visa.id,
      date: '2026-10-02',
      payee: 'A',
      amountCents: -1,
      type: 'fee',
    });
    t.repos.transactions.delete(tx.id);
    expect(t.repos.transactions.getById(tx.id)).toBeUndefined();
    expect(t.repos.transactions.update(tx.id, { payee: 'B' })).toBeUndefined();
  });
});

describe('categories repository', () => {
  it('seeds the 16 defaults once, idempotently, keeping user renames', () => {
    t.repos.categories.seedDefaults();
    t.repos.categories.update('sys-dining', { name: 'Restaurants' });
    t.repos.categories.seedDefaults();
    const list = t.repos.categories.list();
    expect(list).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(list).toHaveLength(16);
    expect(list.every((c) => c.isSystem)).toBe(true);
    expect(t.repos.categories.getById('sys-dining')?.name).toBe('Restaurants');
    expect(list[0].id).toBe('sys-groceries');
  });

  it('custom categories can be deleted; built-ins cannot', () => {
    t.repos.categories.seedDefaults();
    const pets = t.repos.categories.create({ name: 'Pets', icon: 'paw' });
    expect(pets.isSystem).toBe(false);
    expect(pets.sortOrder).toBe(16);
    expect(() => t.repos.categories.delete('sys-other')).toThrow(/Built-in/);
    t.repos.categories.delete(pets.id);
    expect(t.repos.categories.getById(pets.id)).toBeUndefined();
  });

  it('deleting a category leaves transactions uncategorized', () => {
    const visa = t.repos.accounts.create(visaInput);
    const pets = t.repos.categories.create({ name: 'Pets' });
    const tx = t.repos.transactions.create({
      accountId: visa.id,
      date: '2026-10-02',
      payee: 'Pet Valu',
      amountCents: -3000,
      type: 'purchase',
      categoryId: pets.id,
    });
    t.repos.categories.delete(pets.id);
    expect(t.repos.transactions.getById(tx.id)?.categoryId).toBeNull();
  });
});

describe('recurring repository', () => {
  it('creates, updates, lists due rules and deletes', () => {
    const visa = t.repos.accounts.create(visaInput);
    const rule = t.repos.recurring.create({
      accountId: visa.id,
      payee: 'Netflix',
      amountCents: -1699,
      frequency: 'monthly',
      anchorDate: '2026-10-05',
      nextDate: '2026-11-05',
      autoCreate: true,
    });
    expect(rule.interval).toBe(1);
    expect(rule.isActive).toBe(true);
    expect(t.repos.recurring.listDueOnOrBefore('2026-11-04')).toEqual([]);
    expect(t.repos.recurring.listDueOnOrBefore('2026-11-05').map((r) => r.id)).toEqual([rule.id]);

    t.repos.recurring.update(rule.id, { isActive: false });
    expect(t.repos.recurring.listActive()).toEqual([]);
    expect(t.repos.recurring.listDueOnOrBefore('2027-01-01')).toEqual([]);

    t.repos.recurring.delete(rule.id);
    expect(t.repos.recurring.getById(rule.id)).toBeUndefined();
  });

  it('validates amounts, dates and interval', () => {
    const visa = t.repos.accounts.create(visaInput);
    const base = {
      accountId: visa.id,
      payee: 'Gym',
      amountCents: -4500,
      frequency: 'monthly' as const,
      anchorDate: '2026-10-01',
      nextDate: '2026-11-01',
    };
    expect(() => t.repos.recurring.create({ ...base, amountCents: -45.5 })).toThrow();
    expect(() => t.repos.recurring.create({ ...base, endDate: '2026-13-01' })).toThrow();
    expect(() => t.repos.recurring.create({ ...base, interval: 0 })).toThrow();
  });
});

describe('statements repository', () => {
  it('creates, finds by period, updates and deletes', () => {
    const visa = t.repos.accounts.create(visaInput);
    const statement = t.repos.statements.create({
      accountId: visa.id,
      periodStart: '2026-09-16',
      periodEnd: '2026-10-15',
      dueDate: '2026-11-05',
      closingBalanceCents: 50000,
    });
    expect(statement.status).toBe('open');
    expect(statement.amountPaidCents).toBe(0);
    expect(t.repos.statements.findByPeriodEnd(visa.id, '2026-10-15')?.id).toBe(statement.id);
    expect(t.repos.statements.findByPeriodEnd(visa.id, '2026-11-15')).toBeUndefined();

    const paid = t.repos.statements.update(statement.id, {
      amountPaidCents: 50000,
      status: 'paid',
    });
    expect(paid?.status).toBe('paid');

    t.repos.statements.delete(statement.id);
    expect(t.repos.statements.listByAccount(visa.id)).toEqual([]);
  });

  it('validates the period and amounts', () => {
    const visa = t.repos.accounts.create(visaInput);
    const base = {
      accountId: visa.id,
      periodStart: '2026-09-16',
      periodEnd: '2026-10-15',
      dueDate: '2026-11-05',
    };
    expect(() => t.repos.statements.create({ ...base, periodStart: '2026-10-16' })).toThrow();
    expect(() => t.repos.statements.create({ ...base, dueDate: 'soon' })).toThrow();
    expect(() => t.repos.statements.create({ ...base, minimumPaymentCents: 10.1 })).toThrow();
  });
});

describe('settings repository', () => {
  it('returns defaults until set', () => {
    expect(t.repos.settings.get('currency_default')).toBe('CAD');
    expect(t.repos.settings.getAll()).toEqual(SETTINGS_DEFAULTS);
  });

  it('round-trips typed values and upserts', () => {
    t.repos.settings.set('app_lock_enabled', true);
    t.repos.settings.set('lock_timeout_seconds', 300);
    t.repos.settings.set('locale', 'fr-CA');
    t.repos.settings.set('locale', 'en-CA');
    expect(t.repos.settings.get('app_lock_enabled')).toBe(true);
    expect(t.repos.settings.get('lock_timeout_seconds')).toBe(300);
    expect(t.repos.settings.getAll()).toMatchObject({ locale: 'en-CA', app_lock_enabled: true });
  });

  it('falls back to the default for corrupt or mistyped values', () => {
    t.sqlite.prepare("insert into settings (key, value) values ('theme', 'not json')").run();
    t.sqlite
      .prepare("insert into settings (key, value) values ('onboarding_done', '\"yes\"')")
      .run();
    expect(t.repos.settings.get('theme')).toBe('system');
    expect(t.repos.settings.get('onboarding_done')).toBe(false);
  });
});
