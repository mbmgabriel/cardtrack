/**
 * @jest-environment node
 */
import { createTestDatabase } from '@/db/test-database';

let t: ReturnType<typeof createTestDatabase>;
let visaId: string;

beforeEach(() => {
  t = createTestDatabase();
  // Statement day 15, due 21 days later; owed $500 on Sep 1.
  visaId = t.repos.accounts.create({
    name: 'Visa',
    type: 'credit',
    creditLimitCents: 500000,
    openingBalanceCents: -50000,
    openingBalanceDate: '2026-09-01',
    statementDay: 15,
    dueDayOffset: 21,
  }).id;
});
afterEach(() => t.close());

const add = (date: string, amountCents: number, type: 'purchase' | 'payment' = 'purchase') =>
  t.repos.transactions.create({
    accountId: visaId,
    date,
    payee: type === 'payment' ? 'Payment' : 'Store',
    amountCents,
    type,
  });

const byEnd = () => new Map(t.repos.statements.listByAccount(visaId).map((s) => [s.periodEnd, s]));

describe('statements sync', () => {
  it('creates one statement per cycle with the right due dates, idempotently', () => {
    expect(t.repos.statements.sync('2026-10-30')).toBe(3);
    expect(t.repos.statements.sync('2026-10-30')).toBe(0);
    const rows = t.repos.statements.listByAccount(visaId);
    expect(rows.map((s) => [s.periodStart, s.periodEnd, s.dueDate, s.status])).toEqual([
      ['2026-10-16', '2026-11-15', '2026-12-06', 'open'],
      ['2026-09-16', '2026-10-15', '2026-11-05', 'due'],
      ['2026-08-16', '2026-09-15', '2026-10-06', 'overdue'],
    ]);
  });

  it('adds the next cycle once it starts', () => {
    t.repos.statements.sync('2026-10-30');
    expect(t.repos.statements.sync('2026-11-16')).toBe(1);
  });

  it('links payments made between closing and the due date and marks them paid', () => {
    add('2026-09-20', -10000);
    const payment = add('2026-10-20', 60000, 'payment');
    const late = add('2026-11-10', 100, 'payment');
    t.repos.statements.sync('2026-10-30');

    const oct = byEnd().get('2026-10-15')!;
    expect(t.repos.transactions.getById(payment.id)?.statementId).toBe(oct.id);
    expect(t.repos.transactions.getById(late.id)?.statementId).toBeNull();
    // Owed at Oct 15: 500 + 100 = 600, paid 600.
    expect(oct).toMatchObject({ amountPaidCents: 60000, status: 'paid' });
  });

  it('uses the entered closing balance and minimum for status', () => {
    t.repos.statements.sync('2026-10-30');
    const oct = byEnd().get('2026-10-15')!;
    t.repos.statements.update(oct.id, { closingBalanceCents: 50000, minimumPaymentCents: 1500 });
    add('2026-10-25', 1500, 'payment');
    t.repos.statements.sync('2026-11-06');
    expect(byEnd().get('2026-10-15')?.status).toBe('due');
  });

  it('skips accounts without a statement day, archived cards and chequing', () => {
    t.repos.accounts.create({
      name: 'LOC',
      type: 'line_of_credit',
      openingBalanceDate: '2026-09-01',
    });
    t.repos.accounts.create({
      name: 'Chq',
      type: 'debit',
      openingBalanceDate: '2026-09-01',
      statementDay: 1,
    });
    t.repos.accounts.setArchived(visaId, true);
    expect(t.repos.statements.sync('2026-10-30')).toBe(0);
  });

  it('finds the previous statement', () => {
    t.repos.statements.sync('2026-10-30');
    const map = byEnd();
    expect(t.repos.statements.previous(map.get('2026-10-15')!)?.periodEnd).toBe('2026-09-15');
    expect(t.repos.statements.previous(map.get('2026-09-15')!)).toBeUndefined();
  });
});
