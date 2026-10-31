import type { Account, Statement, Transaction } from '@/db/schema';
import { countsTowardBalance } from '@/domain/balances';
import { addDaysISO } from '@/domain/dates';
import {
  amountPaidFor,
  owedAsOf,
  reconcile,
  summarizeStatement,
  type ReconcileState,
  type StatementSummary,
} from '@/domain/statements';

export type StatementListItem = {
  statement: Statement;
  summary: StatementSummary;
  computedClosingCents: number;
  amountPaidCents: number;
};

/** Live figures for one statement from the account's transactions (never stale). */
export function statementListItem(
  statement: Statement,
  account: Account,
  transactions: readonly Transaction[],
  today: string,
): StatementListItem {
  const computedClosingCents = owedAsOf(account, transactions, statement.periodEnd);
  const amountPaidCents = amountPaidFor(statement.id, transactions);
  return {
    statement,
    computedClosingCents,
    amountPaidCents,
    summary: summarizeStatement({ ...statement, amountPaidCents }, computedClosingCents, today),
  };
}

export type StatementView = StatementListItem & {
  /** Non-void transactions dated in the cycle, oldest first. */
  inPeriod: Transaction[];
  /** Posted transactions in the cycle: what a paper statement lists and what reconcile ticks. */
  reconcilable: Transaction[];
  previousClosingCents: number;
  reconcile: ReconcileState;
  /** Payments linked to this statement. */
  payments: Transaction[];
  /** Payments that could be linked: after the cycle started and not linked here yet. */
  candidates: Transaction[];
};

export function buildStatementView(
  statement: Statement,
  account: Account,
  transactions: readonly Transaction[],
  previous: Statement | undefined,
  today: string,
): StatementView {
  const item = statementListItem(statement, account, transactions, today);
  const inPeriod = transactions
    .filter(
      (t) =>
        t.status !== 'void' && t.date >= statement.periodStart && t.date <= statement.periodEnd,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const reconcilable = inPeriod.filter(
    (t) => t.status === 'posted' && countsTowardBalance(t.date, account.openingBalanceDate),
  );
  // Start from the previous statement's printed balance when the user entered it.
  const previousClosingCents =
    previous?.closingBalanceCents ??
    owedAsOf(account, transactions, addDaysISO(statement.periodStart, -1));
  return {
    ...item,
    inPeriod,
    reconcilable,
    previousClosingCents,
    reconcile: reconcile(previousClosingCents, reconcilable, statement.closingBalanceCents),
    payments: transactions.filter((t) => t.statementId === statement.id),
    candidates: transactions.filter(
      (t) =>
        t.type === 'payment' &&
        t.amountCents > 0 &&
        t.status !== 'void' &&
        t.statementId !== statement.id &&
        t.date > statement.periodStart,
    ),
  };
}
