/**
 * Balance rules (PLAN.md §3.2 and §7). Amounts are signed from the user's point of view:
 * negative = money out / debt up, positive = money in / debt down.
 */
import { assertCents, sumCents } from './money';
import { isLiabilityAccount, type AccountType, type TransactionStatus } from './types';

/** Utilization above this ratio is shown in a warning colour. */
export const HIGH_UTILIZATION_THRESHOLD = 0.3;

export type BalanceAccount = {
  type: AccountType;
  openingBalanceCents: number;
  creditLimitCents: number | null;
};

export type BalanceTransaction = {
  date: string;
  amountCents: number;
  status: TransactionStatus;
};

/**
 * Signed sums of an account's transactions by status. Void transactions are never counted, and
 * neither is anything dated before the opening-balance date: the opening balance already includes
 * it (e.g. a CSV import that reaches back past the date the user entered the balance for).
 */
export type TransactionTotals = {
  postedCents: number;
  pendingCents: number;
};

/** Whether a transaction counts toward the balance of an account opened on `openingBalanceDate`. */
export function countsTowardBalance(transactionDate: string, openingBalanceDate: string): boolean {
  return transactionDate >= openingBalanceDate;
}

export function totalsFromTransactions(
  transactions: Iterable<BalanceTransaction>,
  openingBalanceDate: string,
): TransactionTotals {
  const posted: number[] = [];
  const pending: number[] = [];
  for (const tx of transactions) {
    if (!countsTowardBalance(tx.date, openingBalanceDate)) continue;
    if (tx.status === 'posted') posted.push(tx.amountCents);
    else if (tx.status === 'pending') pending.push(tx.amountCents);
  }
  return { postedCents: sumCents(posted), pendingCents: sumCents(pending) };
}

/** opening_balance + sum(posted). Pending holds never affect the posted balance. */
export function postedBalanceCents(account: BalanceAccount, totals: TransactionTotals): number {
  assertCents(account.openingBalanceCents, 'openingBalanceCents');
  return sumCents([account.openingBalanceCents, totals.postedCents]);
}

/** Amount owed on a credit/LOC account as a positive number; negative means a credit balance. */
export function owedCents(account: BalanceAccount, totals: TransactionTotals): number {
  const balance = postedBalanceCents(account, totals);
  return balance === 0 ? 0 : -balance;
}

/** Pending holds as a positive amount (holds are negative pending transactions). */
export function pendingHoldsCents(totals: TransactionTotals): number {
  return totals.pendingCents === 0 ? 0 : -totals.pendingCents;
}

/** credit_limit − owed − pending holds. Null when the account has no limit. */
export function availableCreditCents(
  account: BalanceAccount,
  totals: TransactionTotals,
): number | null {
  if (account.creditLimitCents == null) return null;
  assertCents(account.creditLimitCents, 'creditLimitCents');
  return account.creditLimitCents - owedCents(account, totals) - pendingHoldsCents(totals);
}

/** owed ÷ limit as a ratio (0.25 = 25%). A credit balance counts as 0. Null without a limit. */
export function utilization(account: BalanceAccount, totals: TransactionTotals): number | null {
  if (account.creditLimitCents == null || account.creditLimitCents <= 0) return null;
  return Math.max(0, owedCents(account, totals)) / account.creditLimitCents;
}

export function isHighUtilization(ratio: number | null): boolean {
  return ratio != null && ratio > HIGH_UTILIZATION_THRESHOLD;
}

export type UtilizationRating = 'excellent' | 'good' | 'fair' | 'high';

/**
 * How a utilization ratio reads for credit health: under 10% is excellent, up to the 30%
 * guideline is good, up to half is fair, and above that is high.
 */
export function utilizationRating(ratio: number): UtilizationRating {
  if (ratio < 0.1) return 'excellent';
  if (ratio <= HIGH_UTILIZATION_THRESHOLD) return 'good';
  if (ratio <= 0.5) return 'fair';
  return 'high';
}

export type AccountSummary = {
  /** Posted balance: owed (positive) for credit/LOC, cash on hand for everything else. */
  balanceCents: number;
  isLiability: boolean;
  pendingHoldsCents: number;
  availableCreditCents: number | null;
  utilization: number | null;
};

export function summarizeAccount(
  account: BalanceAccount,
  totals: TransactionTotals,
): AccountSummary {
  const isLiability = isLiabilityAccount(account.type);
  return {
    balanceCents: isLiability ? owedCents(account, totals) : postedBalanceCents(account, totals),
    isLiability,
    pendingHoldsCents: pendingHoldsCents(totals),
    availableCreditCents: isLiability ? availableCreditCents(account, totals) : null,
    utilization: isLiability ? utilization(account, totals) : null,
  };
}

export type CurrencyTotals = {
  currency: string;
  owedCents: number;
  cashCents: number;
  creditLimitCents: number;
  availableCreditCents: number;
  pendingHoldsCents: number;
};

/** Dashboard totals grouped per currency — no FX conversion in v1 (PLAN.md §7). */
export function totalsByCurrency(
  accounts: Iterable<{ currency: string; account: BalanceAccount; totals: TransactionTotals }>,
): CurrencyTotals[] {
  const byCurrency = new Map<string, CurrencyTotals>();
  for (const { currency, account, totals } of accounts) {
    let entry = byCurrency.get(currency);
    if (!entry) {
      entry = {
        currency,
        owedCents: 0,
        cashCents: 0,
        creditLimitCents: 0,
        availableCreditCents: 0,
        pendingHoldsCents: 0,
      };
      byCurrency.set(currency, entry);
    }
    const summary = summarizeAccount(account, totals);
    entry.pendingHoldsCents += summary.pendingHoldsCents;
    if (summary.isLiability) {
      entry.owedCents += summary.balanceCents;
      entry.creditLimitCents += account.creditLimitCents ?? 0;
      entry.availableCreditCents += summary.availableCreditCents ?? 0;
    } else {
      entry.cashCents += summary.balanceCents;
    }
  }
  return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

/**
 * Users enter an opening balance the way their statement shows it: amount owed (positive) for
 * credit/LOC, account balance for everything else. Stored per §3.2, where debt is negative.
 */
export function openingBalanceToStored(type: AccountType, enteredCents: number): number {
  assertCents(enteredCents, 'openingBalance');
  return isLiabilityAccount(type) && enteredCents !== 0 ? -enteredCents : enteredCents;
}

/** Inverse of `openingBalanceToStored`, for pre-filling the edit form. */
export function openingBalanceForDisplay(type: AccountType, storedCents: number): number {
  return openingBalanceToStored(type, storedCents);
}
