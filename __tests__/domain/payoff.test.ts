import {
  comparePayoff,
  planProgress,
  estimatedMinimumCents,
  simulatePayoff,
  type Debt,
} from '@/domain/payoff';

const debt = (overrides: Partial<Debt>): Debt => ({
  id: 'd',
  name: 'Debt',
  balanceCents: 100000,
  aprBps: 0,
  minimumCents: 10000,
  ...overrides,
});

describe('estimatedMinimumCents', () => {
  it('is the greater of $10 or 3%, never more than the balance', () => {
    expect(estimatedMinimumCents(500000)).toBe(15000);
    expect(estimatedMinimumCents(20000)).toBe(1000);
    expect(estimatedMinimumCents(600)).toBe(600);
    expect(estimatedMinimumCents(0)).toBe(0);
  });
});

describe('simulatePayoff', () => {
  it('pays a 0% debt off in balance ÷ payment months', () => {
    const plan = simulatePayoff([debt({})], { strategy: 'avalanche', extraCents: 0 });
    expect(plan.months).toBe(10);
    expect(plan.interestCents).toBe(0);
    expect(plan.balances[0]).toBe(100000);
    expect(plan.balances.at(-1)).toBe(0);
  });

  it('charges monthly interest before payments', () => {
    // $1,000 at 12% APR = $10 interest in month one.
    const plan = simulatePayoff([debt({ aprBps: 1200, minimumCents: 101000 })], {
      strategy: 'avalanche',
      extraCents: 0,
    });
    expect(plan.months).toBe(1);
    expect(plan.interestCents).toBe(1000);
  });

  it('sends extra money to the highest rate first (avalanche) or smallest balance (snowball)', () => {
    const debts = [
      debt({ id: 'big-high', balanceCents: 300000, aprBps: 2400, minimumCents: 5000 }),
      // A small minimum: left alone it would take years, so the strategy decides the order.
      debt({ id: 'small-low', balanceCents: 50000, aprBps: 600, minimumCents: 1000 }),
    ];
    const avalanche = simulatePayoff(debts, { strategy: 'avalanche', extraCents: 20000 });
    const snowball = simulatePayoff(debts, { strategy: 'snowball', extraCents: 20000 });
    const first = (p: typeof avalanche) =>
      [...p.debts].sort((a, b) => a.paidOffMonth! - b.paidOffMonth!)[0].id;
    expect(first(avalanche)).toBe('big-high');
    expect(first(snowball)).toBe('small-low');
    // Avalanche never costs more interest.
    expect(avalanche.interestCents).toBeLessThanOrEqual(snowball.interestCents);
  });

  it("rolls a cleared debt's minimum into the next one", () => {
    const debts = [
      debt({ id: 'a', balanceCents: 10000, minimumCents: 10000 }),
      debt({ id: 'b', balanceCents: 100000, minimumCents: 10000 }),
    ];
    const withRollover = simulatePayoff(debts, { strategy: 'snowball', extraCents: 0 });
    const without = simulatePayoff(debts, { strategy: 'snowball', extraCents: 0, rollover: false });
    expect(withRollover.months).toBeLessThan(without.months!);
  });

  it('says so when payments never cover the interest', () => {
    // $10,000 at 24% = $200/month interest; a $150 minimum never gets there.
    const plan = simulatePayoff(
      [debt({ id: 'trap', balanceCents: 1000000, aprBps: 2400, minimumCents: 15000 })],
      { strategy: 'avalanche', extraCents: 0 },
    );
    expect(plan.months).toBeNull();
    expect(plan.stuck).toEqual(['trap']);
  });
});

describe('comparePayoff', () => {
  it('shows what paying extra saves over minimums only', () => {
    const debts = [debt({ balanceCents: 500000, aprBps: 1999, minimumCents: 15000 })];
    const { plan, minimumsOnly, interestSavedCents, monthsSaved } = comparePayoff(
      debts,
      'avalanche',
      10000,
    );
    expect(plan.months).toBeLessThan(minimumsOnly.months!);
    expect(interestSavedCents).toBeGreaterThan(0);
    expect(monthsSaved).toBe(minimumsOnly.months! - plan.months!);
  });
});

describe('planProgress', () => {
  const baseline = {
    startedOn: '2026-10-15',
    monthlyCents: 50000,
    debtIds: ['visa'],
    balances: [300000, 250000, 200000, 150000],
  };

  it('is on track when balances match the plan', () => {
    const p = planProgress(baseline, 250000, '2026-11-15');
    expect(p).toMatchObject({ expectedCents: 250000, status: 'onTrack', differenceCents: 0 });
    expect(p.paidShare).toBeCloseTo(1 / 6);
  });

  it('reads the plan part-way through a month', () => {
    // Halfway from Nov 15 to Dec 15: halfway from $2,500 to $2,000.
    expect(planProgress(baseline, 225000, '2026-11-30').expectedCents).toBeCloseTo(225000, -3);
  });

  it('is behind when more is owed than planned, and ahead when less', () => {
    expect(planProgress(baseline, 230000, '2026-12-15')).toMatchObject({
      status: 'behind',
      differenceCents: 30000,
    });
    expect(planProgress(baseline, 150000, '2026-12-15')).toMatchObject({
      status: 'ahead',
      differenceCents: -50000,
    });
  });

  it('allows small differences ($10 or 2%)', () => {
    expect(planProgress(baseline, 203000, '2026-12-15').status).toBe('onTrack');
  });

  it('holds at the end of the plan, and before it starts', () => {
    expect(planProgress(baseline, 150000, '2027-12-01').expectedCents).toBe(150000);
    expect(planProgress(baseline, 300000, '2026-10-15').expectedCents).toBe(300000);
  });
});
