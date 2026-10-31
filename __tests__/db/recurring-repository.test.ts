/**
 * @jest-environment node
 */
import type { RecurringRuleInput } from '@/db/repositories/recurring';
import { createTestDatabase } from '@/db/test-database';

let t: ReturnType<typeof createTestDatabase>;
let visaId: string;
let chequingId: string;

beforeEach(() => {
  t = createTestDatabase();
  t.repos.categories.seedDefaults();
  visaId = t.repos.accounts.create({
    name: 'Visa',
    type: 'credit',
    openingBalanceDate: '2026-10-01',
  }).id;
  chequingId = t.repos.accounts.create({
    name: 'Chequing',
    type: 'debit',
    openingBalanceDate: '2026-10-01',
  }).id;
});
afterEach(() => t.close());

function netflix(overrides: Partial<RecurringRuleInput> = {}) {
  return t.repos.recurring.create({
    accountId: visaId,
    payee: 'Netflix',
    amountCents: -1699,
    categoryId: 'sys-subscriptions',
    frequency: 'monthly',
    interval: 1,
    anchorDate: '2026-10-03',
    nextDate: '2026-11-03',
    autoCreate: true,
    ...overrides,
  });
}

const generated = (ruleId: string) =>
  t.repos.transactions.listByAccount(visaId).filter((r) => r.recurringId === ruleId);

describe('processDue', () => {
  it('generates exactly one transaction per period, however often it runs', () => {
    const rule = netflix();
    expect(t.repos.recurring.processDue('2026-11-02', 'pending')).toBe(0);
    expect(t.repos.recurring.processDue('2026-11-03', 'pending')).toBe(1);
    expect(t.repos.recurring.processDue('2026-11-03', 'pending')).toBe(0);
    expect(t.repos.recurring.processDue('2026-11-20', 'pending')).toBe(0);
    expect(t.repos.recurring.processDue('2026-12-03', 'pending')).toBe(1);

    expect(generated(rule.id).map((r) => [r.date, r.amountCents, r.status, r.type])).toEqual([
      ['2026-12-03', -1699, 'pending', 'purchase'],
      ['2026-11-03', -1699, 'pending', 'purchase'],
    ]);
    expect(generated(rule.id)[0].categoryId).toBe('sys-subscriptions');
    expect(t.repos.recurring.getById(rule.id)?.nextDate).toBe('2027-01-03');
  });

  it('uses the chosen status and catches up on missed periods', () => {
    const rule = netflix({ nextDate: '2026-09-03', anchorDate: '2026-08-03' });
    expect(t.repos.recurring.processDue('2026-11-05', 'posted')).toBe(3);
    expect(generated(rule.id).every((r) => r.status === 'posted')).toBe(true);
  });

  it('skips a date that already has a transaction from the rule', () => {
    const rule = netflix();
    t.repos.transactions.create({
      accountId: visaId,
      date: '2026-11-03',
      payee: 'Netflix',
      amountCents: -1699,
      type: 'purchase',
      recurringId: rule.id,
    });
    expect(t.repos.recurring.processDue('2026-11-03', 'pending')).toBe(0);
    expect(t.repos.recurring.getById(rule.id)?.nextDate).toBe('2026-12-03');
  });

  it('only moves the next date for reminder-only rules', () => {
    const rule = netflix({ autoCreate: false, nextDate: '2026-10-03' });
    expect(t.repos.recurring.processDue('2026-10-20', 'pending')).toBe(0);
    expect(t.repos.recurring.getById(rule.id)?.nextDate).toBe('2026-11-03');
  });

  it('deactivates rules that have ended', () => {
    const rule = netflix({ endDate: '2026-11-10' });
    expect(t.repos.recurring.processDue('2026-11-15', 'pending')).toBe(1);
    expect(t.repos.recurring.getById(rule.id)?.isActive).toBe(false);
  });

  it('records money in as a deposit, and skips archived accounts', () => {
    const pay = netflix({
      accountId: chequingId,
      payee: 'Paycheque',
      amountCents: 250000,
      frequency: 'biweekly',
      nextDate: '2026-10-31',
    });
    t.repos.recurring.processDue('2026-11-03', 'posted');
    expect(t.repos.transactions.listByAccount(chequingId)[0]).toMatchObject({
      recurringId: pay.id,
      type: 'deposit',
      amountCents: 250000,
    });

    const archived = netflix({ nextDate: '2026-11-03' });
    t.repos.accounts.setArchived(visaId, true);
    // Only the paycheque runs: Nov 14, Nov 28, Dec 12, Dec 26.
    expect(t.repos.recurring.processDue('2026-12-31', 'posted')).toBe(4);
    expect(generated(archived.id)).toEqual([]);
  });
});

describe('settings for recurring', () => {
  it('defaults and stores the auto status and dismissed suggestions', () => {
    expect(t.repos.settings.get('recurring_auto_status')).toBe('pending');
    expect(t.repos.settings.get('recurring_dismissed')).toEqual([]);
    t.repos.settings.set('recurring_dismissed', ['visa|netflix']);
    expect(t.repos.settings.get('recurring_dismissed')).toEqual(['visa|netflix']);
  });

  it('ignores a stored value with the wrong shape', () => {
    t.repos.settings.set('recurring_dismissed', { not: 'an array' } as never);
    expect(t.repos.settings.get('recurring_dismissed')).toEqual([]);
    t.repos.settings.set('locale', ['fr-CA'] as never);
    expect(t.repos.settings.get('locale')).toBe('en-CA');
  });
});
