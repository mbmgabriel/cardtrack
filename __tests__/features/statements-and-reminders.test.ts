/**
 * @jest-environment node
 */
import { createTestDatabase } from '@/db/test-database';
import { planReminders } from '@/domain/reminders';
import { reminderSources } from '@/features/reminders/reminder-sources';
import { buildStatementView } from '@/features/statements/statement-view';

let t: ReturnType<typeof createTestDatabase>;
let visaId: string;

beforeEach(() => {
  t = createTestDatabase();
  visaId = t.repos.accounts.create({
    name: 'TD Visa',
    type: 'credit',
    creditLimitCents: 500000,
    openingBalanceCents: -20000,
    openingBalanceDate: '2026-09-20',
    statementDay: 15,
    dueDayOffset: 21,
  }).id;
});
afterEach(() => t.close());

const add = (date: string, amountCents: number, type: 'purchase' | 'payment' = 'purchase') =>
  t.repos.transactions.create({ accountId: visaId, date, payee: 'Store', amountCents, type });

function sources(today: string) {
  const accounts = t.repos.accounts.list({ includeArchived: true });
  return reminderSources(
    {
      accounts,
      statements: t.repos.statements.listByAccount(visaId),
      transactionsByAccount: new Map([[visaId, t.repos.transactions.listByAccount(visaId)]]),
      rules: t.repos.recurring.listActive(),
    },
    today,
  );
}

const settings = { enabled: true, dueDaysBefore: 3, recurringEnabled: true, hour: 9 };

describe('statement day 15 / offset 21 (PLAN.md Phase 6 "done when")', () => {
  it('shows the right due date and plans a reminder for it', () => {
    add('2026-10-01', -5000);
    t.repos.statements.sync('2026-10-30');

    const oct = t.repos.statements.listByAccount(visaId).find((s) => s.periodEnd === '2026-10-15')!;
    expect(oct).toMatchObject({ periodStart: '2026-09-16', dueDate: '2026-11-05', status: 'due' });

    const { dues } = sources('2026-10-30');
    expect(dues.find((d) => d.statementId === oct.id)).toMatchObject({
      dueDate: '2026-11-05',
      amountCents: 25000,
      accountName: 'TD Visa',
    });

    const plan = planReminders(dues, [], settings, { date: '2026-10-30', minutes: 600 });
    expect(plan.filter((r) => r.kind === 'due' && r.source.statementId === oct.id)).toEqual([
      expect.objectContaining({ fireDate: '2026-11-02', daysBefore: 3 }),
      expect.objectContaining({ fireDate: '2026-11-05', daysBefore: 0 }),
    ]);
  });

  it('stops reminding once the statement is paid', () => {
    add('2026-10-01', -5000);
    add('2026-10-25', 25000, 'payment');
    t.repos.statements.sync('2026-10-30');
    const { dues } = sources('2026-10-30');
    expect(dues.map((d) => d.dueDate)).toEqual(['2026-12-06']);
    // The open cycle has no amount yet.
    expect(dues[0].amountCents).toBeNull();
  });

  it('reminds before recurring charges on active accounts only', () => {
    t.repos.recurring.create({
      accountId: visaId,
      payee: 'Netflix',
      amountCents: -1699,
      frequency: 'monthly',
      anchorDate: '2026-10-03',
      nextDate: '2026-11-03',
      remindDaysBefore: 2,
    });
    expect(
      sources('2026-10-30')
        .charges.map((c) => c.date)
        .slice(0, 2),
    ).toEqual(['2026-11-03', '2026-12-03']);
    t.repos.accounts.setArchived(visaId, true);
    expect(sources('2026-10-30')).toEqual({ dues: [], charges: [] });
  });
});

describe('buildStatementView', () => {
  it('lists the cycle, links payments and reconciles against the paper statement', () => {
    add('2026-09-25', -3000);
    add('2026-10-10', -2000);
    add('2026-10-16', -999);
    const pay = add('2026-10-25', 10000, 'payment');
    t.repos.statements.sync('2026-10-30');
    const statements = t.repos.statements.listByAccount(visaId);
    const oct = statements.find((s) => s.periodEnd === '2026-10-15')!;
    t.repos.statements.update(oct.id, { closingBalanceCents: 25000 });

    const txs = t.repos.transactions.listByAccount(visaId);
    const view = buildStatementView(
      t.repos.statements.getById(oct.id)!,
      t.repos.accounts.getById(visaId)!,
      txs,
      t.repos.statements.previous(oct),
      '2026-10-30',
    );
    // The first cycle (opened Sep 20): no previous statement.
    expect(t.repos.statements.previous(oct)).toBeUndefined();
    expect(view.inPeriod.map((x) => x.amountCents)).toEqual([-3000, -2000]);
    expect(view.computedClosingCents).toBe(25000);
    expect(view.summary).toMatchObject({
      status: 'due',
      differenceCents: 0,
      remainingCents: 15000,
    });
    expect(view.payments.map((p) => p.id)).toEqual([pay.id]);
    expect(view.candidates).toEqual([]);
    // So the reconcile starts from the opening balance of $200.
    expect(view.previousClosingCents).toBe(20000);
    expect(view.reconcile).toMatchObject({ clearedCents: 20000, differenceCents: 5000 });

    for (const tx of view.reconcilable) t.repos.transactions.update(tx.id, { isReconciled: true });
    const after = buildStatementView(
      t.repos.statements.getById(oct.id)!,
      t.repos.accounts.getById(visaId)!,
      t.repos.transactions.listByAccount(visaId),
      t.repos.statements.previous(oct),
      '2026-10-30',
    );
    expect(after.reconcile).toMatchObject({ isReconciled: true, checkedCount: 2 });
  });
});
