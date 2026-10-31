/**
 * Statement cycles, status and reconciliation (PLAN.md Phase 6). Balances here are amounts OWED
 * (positive = debt), matching what a paper statement shows.
 */
import { countsTowardBalance, type BalanceTransaction } from './balances';
import {
  addDaysISO,
  DEFAULT_DUE_DAY_OFFSET,
  dueDateFor,
  statementPeriodFor,
  type StatementPeriod,
} from './dates';
import { sumCents } from './money';
import type { StatementStatus, TransactionStatus, TransactionType } from './types';

/** How far back statements are auto-created for a new card. */
export const MAX_BACKFILL_CYCLES = 12;

export type StatementAccount = {
  statementDay: number;
  dueDayOffset: number | null;
  openingBalanceCents: number;
  openingBalanceDate: string;
};

export type CycleToCreate = StatementPeriod & { dueDate: string };

/**
 * Cycles that should have a statement but don't: every cycle from the one containing the opening
 * balance date through the cycle in progress, at most the last `MAX_BACKFILL_CYCLES`.
 */
export function missingCycles(
  account: StatementAccount,
  existingPeriodEnds: ReadonlySet<string>,
  today: string,
): CycleToCreate[] {
  const current = statementPeriodFor(today, account.statementDay);
  const first = statementPeriodFor(account.openingBalanceDate, account.statementDay);
  const cycles: StatementPeriod[] = [];
  for (let p = current; cycles.length < MAX_BACKFILL_CYCLES;) {
    cycles.unshift(p);
    if (p.end <= first.end) break;
    p = statementPeriodFor(addDaysISO(p.start, -1), account.statementDay);
  }
  return cycles
    .filter((p) => !existingPeriodEnds.has(p.end))
    .map((p) => ({
      ...p,
      dueDate: dueDateFor(p.end, account.dueDayOffset ?? DEFAULT_DUE_DAY_OFFSET),
    }));
}

/** Amount owed at the end of `date`: opening balance plus posted transactions up to that day. */
export function owedAsOf(
  account: Pick<StatementAccount, 'openingBalanceCents' | 'openingBalanceDate'>,
  transactions: Iterable<BalanceTransaction>,
  date: string,
): number {
  const amounts: number[] = [account.openingBalanceCents];
  for (const tx of transactions) {
    if (
      tx.status === 'posted' &&
      countsTowardBalance(tx.date, account.openingBalanceDate) &&
      tx.date <= date
    ) {
      amounts.push(tx.amountCents);
    }
  }
  const balance = sumCents(amounts);
  return balance === 0 ? 0 : -balance;
}

export type StatementFigures = {
  periodEnd: string;
  dueDate: string;
  /** What the paper statement says, if the user entered it. */
  closingBalanceCents: number | null;
  minimumPaymentCents: number | null;
  /** Sum of payments linked to this statement. */
  amountPaidCents: number;
};

export type StatementSummary = {
  status: StatementStatus;
  /** The entered closing balance, or the computed one until it is entered. */
  balanceDueCents: number;
  minimumDueCents: number;
  remainingCents: number;
  paidInFull: boolean;
  minimumMet: boolean;
  /** entered − computed; null until a closing balance is entered. */
  differenceCents: number | null;
};

/**
 * Status rules: `open` until the cycle closes; `paid` once the balance is paid (or nothing is
 * owed); `overdue` after the due date if the minimum (or, without one, the balance) isn't paid;
 * otherwise `due`.
 */
export function summarizeStatement(
  s: StatementFigures,
  computedClosingCents: number,
  today: string,
): StatementSummary {
  const balanceDue = s.closingBalanceCents ?? computedClosingCents;
  const minimumDue = Math.min(
    Math.max(0, s.minimumPaymentCents ?? balanceDue),
    Math.max(0, balanceDue),
  );
  const paidInFull = balanceDue <= 0 || s.amountPaidCents >= balanceDue;
  const minimumMet = s.amountPaidCents >= minimumDue;
  let status: StatementStatus;
  if (today <= s.periodEnd) status = 'open';
  else if (paidInFull) status = 'paid';
  else if (today > s.dueDate && !minimumMet) status = 'overdue';
  else status = 'due';
  return {
    status,
    balanceDueCents: balanceDue,
    minimumDueCents: minimumDue,
    remainingCents: Math.max(0, balanceDue - s.amountPaidCents),
    paidInFull,
    minimumMet,
    differenceCents:
      s.closingBalanceCents == null ? null : s.closingBalanceCents - computedClosingCents,
  };
}

export type ReconcileTransaction = { amountCents: number; isReconciled: boolean };

export type ReconcileState = {
  /** Previous closing balance plus every ticked transaction, as an amount owed. */
  clearedCents: number;
  /** Statement closing balance − cleared; null until the closing balance is entered. */
  differenceCents: number | null;
  isReconciled: boolean;
  checkedCount: number;
};

/**
 * Reconcile against the paper statement: start from the previous closing balance, tick each
 * transaction that appears on the statement, and the result should equal its closing balance.
 */
export function reconcile(
  previousClosingCents: number,
  transactions: readonly ReconcileTransaction[],
  closingBalanceCents: number | null,
): ReconcileState {
  const checked = transactions.filter((t) => t.isReconciled);
  // Charges are negative and increase what is owed.
  const cleared = previousClosingCents - sumCents(checked.map((t) => t.amountCents));
  const difference = closingBalanceCents == null ? null : closingBalanceCents - cleared;
  return {
    clearedCents: cleared === 0 ? 0 : cleared,
    differenceCents: difference,
    isReconciled: difference === 0,
    checkedCount: checked.length,
  };
}

export type PaymentCandidate = {
  date: string;
  amountCents: number;
  type: TransactionType;
  status: TransactionStatus;
  statementId: string | null;
};

/** Payments made after the statement closed and by its due date pay that statement. */
export function isPaymentForPeriod(
  tx: PaymentCandidate,
  period: { periodEnd: string; dueDate: string },
): boolean {
  return (
    tx.statementId == null &&
    tx.type === 'payment' &&
    tx.status !== 'void' &&
    tx.amountCents > 0 &&
    tx.date > period.periodEnd &&
    tx.date <= period.dueDate
  );
}

/** Sum of payments linked to a statement (void rows don't count). */
export function amountPaidFor(
  statementId: string,
  transactions: Iterable<{
    statementId: string | null;
    status: TransactionStatus;
    amountCents: number;
  }>,
): number {
  const amounts: number[] = [];
  for (const tx of transactions) {
    if (tx.statementId === statementId && tx.status !== 'void' && tx.amountCents > 0) {
      amounts.push(tx.amountCents);
    }
  }
  return sumCents(amounts);
}
