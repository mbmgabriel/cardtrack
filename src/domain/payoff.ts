/**
 * Debt payoff planning (CardTrack Pro): month-by-month simulation of paying off cards, lines of
 * credit and loans. All amounts are integer cents; interest is monthly (APR ÷ 12), rounded to the
 * cent each month, and charged before that month's payments.
 */

export type PayoffStrategy = 'avalanche' | 'snowball';

export type Debt = {
  id: string;
  name: string;
  balanceCents: number;
  /** Annual rate in basis points (1999 = 19.99%); null when unknown, treated as 0%. */
  aprBps: number | null;
  /** Paid every month until the debt is gone. */
  minimumCents: number;
};

export type DebtResult = {
  id: string;
  /** Month the debt is cleared (1 = next month's payment), or null if it never is. */
  paidOffMonth: number | null;
  interestCents: number;
};

export type PayoffPlan = {
  /** Months until every debt is cleared, or null if the payments never get there. */
  months: number | null;
  interestCents: number;
  /** Total of all debts remaining at the end of each month, starting with today. */
  balances: number[];
  debts: DebtResult[];
  /** Debts whose payments don't even cover their interest under this plan. */
  stuck: string[];
};

/** Stop simulating after this long: a plan longer than 50 years is effectively "never". */
export const MAX_MONTHS = 600;

/** Canadian cards typically ask for the greater of $10 or 3% of the balance (plus interest). */
export function estimatedMinimumCents(balanceCents: number): number {
  if (balanceCents <= 0) return 0;
  return Math.min(balanceCents, Math.max(1000, Math.round(balanceCents * 0.03)));
}

function monthlyInterest(balanceCents: number, aprBps: number | null): number {
  if (!aprBps || balanceCents <= 0) return 0;
  return Math.round((balanceCents * aprBps) / 10000 / 12);
}

/** Which unpaid debt gets the extra money first. */
function target(debts: readonly { debt: Debt; balance: number }[], strategy: PayoffStrategy) {
  const open = debts.filter((d) => d.balance > 0);
  return open.sort((a, b) =>
    strategy === 'avalanche'
      ? (b.debt.aprBps ?? 0) - (a.debt.aprBps ?? 0) || a.balance - b.balance
      : a.balance - b.balance || (b.debt.aprBps ?? 0) - (a.debt.aprBps ?? 0),
  )[0];
}

/**
 * Simulate paying `debts` off: every debt gets its minimum each month, and `extraCents` (plus,
 * when `rollover` is on, the minimum of every debt already cleared) goes to the strategy's
 * target. With no extra and no rollover this is "minimum payments only".
 */
export function simulatePayoff(
  debts: readonly Debt[],
  {
    strategy,
    extraCents,
    rollover = true,
  }: { strategy: PayoffStrategy; extraCents: number; rollover?: boolean },
): PayoffPlan {
  const state = debts
    .filter((d) => d.balanceCents > 0)
    .map((debt) => ({
      debt,
      balance: debt.balanceCents,
      interest: 0,
      paidOffMonth: null as number | null,
    }));
  const balances = [state.reduce((s, d) => s + d.balance, 0)];
  let month = 0;

  while (state.some((d) => d.balance > 0) && month < MAX_MONTHS) {
    month++;
    for (const d of state) {
      if (d.balance <= 0) continue;
      const interest = monthlyInterest(d.balance, d.debt.aprBps);
      d.balance += interest;
      d.interest += interest;
    }
    // Minimums first; anything a nearly-paid debt doesn't need joins the extra.
    let spare = extraCents;
    for (const d of state) {
      if (d.paidOffMonth != null) {
        if (rollover) spare += d.debt.minimumCents;
        continue;
      }
      const paid = Math.min(d.balance, d.debt.minimumCents);
      d.balance -= paid;
      spare += d.debt.minimumCents - paid;
    }
    if (!rollover) spare = Math.min(spare, extraCents);
    // Then the extra, to one target at a time until it runs out.
    let next = target(state, strategy);
    while (spare > 0 && next) {
      const paid = Math.min(next.balance, spare);
      next.balance -= paid;
      spare -= paid;
      next = target(state, strategy);
    }
    for (const d of state) {
      if (d.balance <= 0 && d.paidOffMonth == null) {
        d.balance = 0;
        d.paidOffMonth = month;
      }
    }
    balances.push(state.reduce((s, d) => s + d.balance, 0));
  }

  const done = state.every((d) => d.paidOffMonth != null);
  return {
    months: done ? month : null,
    interestCents: state.reduce((s, d) => s + d.interest, 0),
    balances,
    debts: state.map((d) => ({
      id: d.debt.id,
      paidOffMonth: d.paidOffMonth,
      interestCents: d.interest,
    })),
    stuck: state
      .filter(
        (d) =>
          d.paidOffMonth == null &&
          d.debt.minimumCents <= monthlyInterest(d.debt.balanceCents, d.debt.aprBps),
      )
      .map((d) => d.debt.id),
  };
}

export type PayoffComparison = {
  plan: PayoffPlan;
  minimumsOnly: PayoffPlan;
  /** Interest the plan saves over minimum payments only (null if minimums never finish). */
  interestSavedCents: number | null;
  monthsSaved: number | null;
};

/** The chosen plan next to paying only the minimums, and what the plan saves. */
export function comparePayoff(
  debts: readonly Debt[],
  strategy: PayoffStrategy,
  extraCents: number,
): PayoffComparison {
  const plan = simulatePayoff(debts, { strategy, extraCents });
  const minimumsOnly = simulatePayoff(debts, { strategy, extraCents: 0, rollover: false });
  const finished = plan.months != null && minimumsOnly.months != null;
  return {
    plan,
    minimumsOnly,
    interestSavedCents: finished ? minimumsOnly.interestCents - plan.interestCents : null,
    monthsSaved: finished ? minimumsOnly.months! - plan.months! : null,
  };
}

/** A plan the user chose to follow, saved so real balances can be compared against it later. */
export type PayoffBaseline = {
  /** `YYYY-MM-DD` the plan started. */
  startedOn: string;
  /** What the plan paid toward debt each month (minimums + extra) when it started. */
  monthlyCents: number;
  /** The debts it covers; debts added later aren't counted against it. */
  debtIds: string[];
  /** Planned total still owed at the start of each month: [0] is the starting total. */
  balances: number[];
};

export type PlanProgress = {
  /** What the plan expected to be owed by today. */
  expectedCents: number;
  actualCents: number;
  /** Actual − expected: positive means more is owed than planned (behind). */
  differenceCents: number;
  status: 'ahead' | 'onTrack' | 'behind';
  /** Share of the starting total paid off so far, and what the plan expected (0–1). */
  paidShare: number;
  expectedShare: number;
};

/**
 * How real balances compare with a saved plan today. The planned balance is read between the
 * month just passed and the next one, in proportion to how far through the month today is.
 * Within $10 or 2% of the plan (whichever is more) counts as on track.
 */
export function planProgress(
  baseline: PayoffBaseline,
  actualCents: number,
  today: string,
): PlanProgress {
  const start = new Date(`${baseline.startedOn}T00:00:00`);
  const now = new Date(`${today}T00:00:00`);
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months--;
  months = Math.max(0, months);
  const monthStart = new Date(start);
  monthStart.setMonth(start.getMonth() + months);
  const monthEnd = new Date(start);
  monthEnd.setMonth(start.getMonth() + months + 1);
  const fraction = Math.min(
    1,
    Math.max(
      0,
      (now.getTime() - monthStart.getTime()) / (monthEnd.getTime() - monthStart.getTime()),
    ),
  );
  const at = (m: number) => baseline.balances[Math.min(m, baseline.balances.length - 1)] ?? 0;
  const expectedCents = Math.round(at(months) + (at(months + 1) - at(months)) * fraction);
  const differenceCents = actualCents - expectedCents;
  const tolerance = Math.max(1000, Math.round(expectedCents * 0.02));
  const startTotal = baseline.balances[0] ?? 0;
  const share = (owed: number) =>
    startTotal > 0 ? Math.min(1, Math.max(0, (startTotal - owed) / startTotal)) : 1;
  return {
    expectedCents,
    actualCents,
    differenceCents,
    status:
      Math.abs(differenceCents) <= tolerance ? 'onTrack' : differenceCents > 0 ? 'behind' : 'ahead',
    paidShare: share(actualCents),
    expectedShare: share(expectedCents),
  };
}
