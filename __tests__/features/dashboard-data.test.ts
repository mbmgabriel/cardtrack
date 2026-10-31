import type { Account, RecurringRule } from '@/db/schema';
import { summarizeAccount } from '@/domain/balances';
import type { AccountWithSummary } from '@/features/accounts/account-summaries';
import {
  buildTimeline,
  compareSpending,
  dashboardView,
  monthlyRecurringByCurrency,
  spendingPace,
  summarizeByCurrency,
  upcomingDueDates,
  upcomingRecurring,
} from '@/features/dashboard/dashboard-data';

function account(overrides: Partial<Account>): Account {
  return {
    id: 'a',
    name: 'Account',
    institution: '',
    type: 'credit',
    network: null,
    last4: null,
    currency: 'CAD',
    color: '#1565C0',
    creditLimitCents: null,
    openingBalanceCents: 0,
    openingBalanceDate: '2026-10-01',
    statementDay: null,
    dueDayOffset: null,
    interestRateBps: null,
    isArchived: false,
    imagePath: null,
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function item(a: Account, postedCents = 0, pendingCents = 0): AccountWithSummary {
  return { account: a, summary: summarizeAccount(a, { postedCents, pendingCents }) };
}

const visa = account({ id: 'visa', name: 'Visa', creditLimitCents: 100000, statementDay: 15 });
const amex = account({ id: 'amex', name: 'Amex', statementDay: 1, dueDayOffset: 25 });
const chequing = account({
  id: 'chq',
  name: 'Chequing',
  type: 'debit',
  openingBalanceCents: 50000,
});

function rule(overrides: Partial<RecurringRule>): RecurringRule {
  return {
    id: 'r',
    accountId: 'visa',
    payee: 'Netflix',
    amountCents: -1699,
    categoryId: null,
    frequency: 'monthly',
    interval: 1,
    anchorDate: '2026-01-03',
    nextDate: '2026-11-03',
    endDate: null,
    autoCreate: false,
    remindDaysBefore: 0,
    isActive: true,
    notes: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('summarizeByCurrency', () => {
  it('adds owed, cash, holds and available credit', () => {
    const [cad] = summarizeByCurrency([
      item(visa, -30000, -2000),
      item(amex, -10000),
      item(chequing, -5000, -1000),
    ]);
    expect(cad).toEqual({
      currency: 'CAD',
      owedCents: 40000,
      cashCents: 45000,
      pendingHoldsCents: 3000,
      availableCreditCents: 68000,
      creditLimitCents: 100000,
      // Amex has no limit, so only the Visa's 300.00 of 1000.00 counts.
      utilization: 0.3,
      hasLiability: true,
      hasCash: true,
    });
  });

  it('a credit balance does not lower utilization below zero', () => {
    const [cad] = summarizeByCurrency([item(visa, 5000)]);
    expect(cad.owedCents).toBe(-5000);
    expect(cad.utilization).toBe(0);
  });

  it('keeps currencies apart, sorted', () => {
    const usd = account({ id: 'usd', type: 'savings', currency: 'USD', openingBalanceCents: 100 });
    const result = summarizeByCurrency([item(usd), item(chequing)]);
    expect(result.map((r) => [r.currency, r.cashCents, r.hasLiability, r.utilization])).toEqual([
      ['CAD', 50000, false, null],
      ['USD', 100, false, null],
    ]);
  });

  it('is empty with no accounts', () => {
    expect(summarizeByCurrency([])).toEqual([]);
  });
});

describe('upcomingDueDates', () => {
  it('lists credit accounts with a statement day, soonest first', () => {
    // Today Oct 30: Visa closed Oct 15 → due Nov 5; Amex closes Nov 1 → due Nov 26.
    const dues = upcomingDueDates([item(amex), item(chequing), item(visa, -30000)], '2026-10-30');
    expect(dues.map((d) => [d.account.id, d.dueDate, d.daysUntil, d.urgency])).toEqual([
      ['visa', '2026-11-05', 6, 'soon'],
      ['amex', '2026-11-26', 27, 'later'],
    ]);
    expect(dues[0].owedCents).toBe(30000);
    expect(dues[0].statementEnd).toBe('2026-10-15');
  });

  it('skips accounts without a statement day and respects the limit', () => {
    const noDay = account({ id: 'loc', type: 'line_of_credit' });
    expect(upcomingDueDates([item(noDay)], '2026-10-30')).toEqual([]);
    expect(upcomingDueDates([item(visa), item(amex)], '2026-10-30', 1)).toHaveLength(1);
  });
});

describe('upcomingRecurring', () => {
  const accounts = new Map([
    ['visa', visa],
    ['old', account({ id: 'old', isArchived: true })],
  ]);

  it('lists active rules due in the next 14 days, soonest first', () => {
    const result = upcomingRecurring(
      [
        rule({ id: 'gym', anchorDate: '2026-01-10' }),
        rule({ id: 'netflix', nextDate: '2026-11-03' }),
        rule({ id: 'far', anchorDate: '2026-01-20' }),
        rule({ id: 'paused', isActive: false }),
        rule({ id: 'archived', accountId: 'old' }),
        rule({ id: 'gone', accountId: 'missing' }),
      ],
      accounts,
      '2026-10-30',
    );
    expect(result.map((r) => [r.rule.id, r.date, r.daysUntil])).toEqual([
      ['netflix', '2026-11-03', 4],
      ['gym', '2026-11-10', 11],
    ]);
  });

  it('lists every occurrence in the window', () => {
    const weekly = rule({ frequency: 'weekly', anchorDate: '2026-10-29' });
    expect(upcomingRecurring([weekly], accounts, '2026-10-30').map((r) => r.date)).toEqual([
      '2026-11-05',
      '2026-11-12',
    ]);
  });

  it('totals recurring charges per month, ignoring income and inactive rules', () => {
    const usdCard = account({ id: 'usd', currency: 'USD' });
    const all = new Map([...accounts, ['usd', usdCard]]);
    expect(
      monthlyRecurringByCurrency(
        [
          rule({ id: 'netflix' }),
          rule({ id: 'insurance', amountCents: -120000, frequency: 'yearly' }),
          rule({ id: 'pay', amountCents: 250000 }),
          rule({ id: 'paused', isActive: false }),
          rule({ id: 'old', accountId: 'old' }),
          rule({ id: 'us', accountId: 'usd', amountCents: -999 }),
        ],
        all,
      ),
    ).toEqual(
      new Map([
        ['CAD', 11699],
        ['USD', 999],
      ]),
    );
  });
});

describe('compareSpending', () => {
  it('compares this month with the same days last month', () => {
    expect(
      compareSpending(
        new Map([['CAD', 15000]]),
        new Map([['CAD', 10000]]),
        new Map([
          ['CAD', 30000],
          ['USD', 500],
        ]),
      ),
    ).toEqual([
      {
        currency: 'CAD',
        thisMonthCents: 15000,
        lastMonthToDateCents: 10000,
        lastMonthCents: 30000,
        change: 0.5,
      },
      {
        currency: 'USD',
        thisMonthCents: 0,
        lastMonthToDateCents: 0,
        lastMonthCents: 500,
        change: null,
      },
    ]);
  });
});

describe('buildTimeline', () => {
  const due = (id: string, dueDate: string) =>
    ({
      account: account({ id }),
      dueDate,
      owedCents: 100,
      statementEnd: '',
      daysUntil: 1,
      urgency: 'soon',
    }) as const;
  const charge = (id: string, date: string) =>
    ({ rule: { id, payee: id } as RecurringRule, account: visa, date, daysUntil: 1 }) as const;

  it('merges dues and charges by day, dues first', () => {
    const days = buildTimeline(
      [due('visa', '2026-11-05')],
      [charge('gym', '2026-11-05'), charge('netflix', '2026-11-03')],
    );
    expect(days.map((d) => [d.date, d.items.map((i) => i.key)])).toEqual([
      ['2026-11-03', ['charge-netflix-2026-11-03']],
      ['2026-11-05', ['due-visa-2026-11-05', 'charge-gym-2026-11-05']],
    ]);
  });

  it('is empty with nothing coming up', () => {
    expect(buildTimeline([], [])).toEqual([]);
  });
});

describe('spendingPace', () => {
  const comparison = {
    currency: 'CAD',
    thisMonthCents: 15000,
    lastMonthToDateCents: 10000,
    lastMonthCents: 30000,
    change: 0.5,
  };

  it('scales to last month', () => {
    expect(spendingPace(comparison)).toEqual({
      spentCents: 15000,
      fill: 0.5,
      marker: 1 / 3,
      change: 0.5,
    });
  });

  it('fills the bar when this month passes last month', () => {
    expect(spendingPace({ ...comparison, thisMonthCents: 40000 })).toMatchObject({
      fill: 1,
      marker: 0.25,
    });
  });

  it('copes with nothing spent and net refunds', () => {
    expect(
      spendingPace({
        ...comparison,
        thisMonthCents: -500,
        lastMonthCents: 0,
        lastMonthToDateCents: 0,
      }),
    ).toMatchObject({ fill: 0, marker: 0 });
  });
});

describe('dashboardView', () => {
  const today = '2026-10-30';
  const netflix = rule({ id: 'netflix', accountId: 'visa' });
  const input = {
    items: [item(visa, -40000), item(amex, -12000), item(chequing)],
    rules: [netflix],
    today,
    spending: {
      thisMonth: new Map([
        ['visa', 10000],
        ['amex', 5000],
      ]),
      lastMonthToDate: new Map([['visa', 8000]]),
      lastMonth: new Map([
        ['visa', 20000],
        ['amex', 7000],
      ]),
    },
  };

  it('covers every card when nothing is focused', () => {
    const view = dashboardView(input, null);
    expect(view.totals[0]).toMatchObject({ owedCents: 52000, cashCents: 50000 });
    expect(view.spending).toEqual([
      expect.objectContaining({ currency: 'CAD', thisMonthCents: 15000, lastMonthCents: 27000 }),
    ]);
    expect(view.monthlyRecurring.get('CAD')).toBe(1699);
    const kinds = view.timeline.flatMap((d) => d.items.map((i) => i.key));
    expect(kinds.some((k) => k.startsWith('due-visa'))).toBe(true);
    expect(kinds.some((k) => k.startsWith('due-amex'))).toBe(true);
  });

  it('narrows everything to the focused card', () => {
    const view = dashboardView(input, 'amex');
    expect(view.totals).toEqual([
      expect.objectContaining({ owedCents: 12000, hasCash: false, hasLiability: true }),
    ]);
    expect(view.spending).toEqual([
      expect.objectContaining({ thisMonthCents: 5000, lastMonthToDateCents: 0, change: null }),
    ]);
    expect(view.monthlyRecurring.size).toBe(0);
    const keys = view.timeline.flatMap((d) => d.items.map((i) => i.key));
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.startsWith('due-amex'))).toBe(true);
  });

  it('gives a card with no spending or schedule an empty view', () => {
    const view = dashboardView(input, 'chq');
    expect(view.spending).toEqual([]);
    expect(view.timeline).toEqual([]);
    expect(view.totals[0]).toMatchObject({ cashCents: 50000, hasLiability: false });
  });
});
