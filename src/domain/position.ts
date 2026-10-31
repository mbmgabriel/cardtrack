/**
 * Where the user stands today (Reports, "Where you stand"): net worth and money that's safe to
 * spend. Per currency, as positive cents unless noted; no FX conversion in v1 (PLAN.md §7).
 */
import { isLiabilityAccount, type AccountType } from './types';

/** An account with its current balance: owed (positive) for debts, money held for the rest. */
export type PositionAccount = {
  type: AccountType;
  currency: string;
  isArchived: boolean;
  balanceCents: number;
  availableCreditCents: number | null;
};

export type TypeTotal = { type: AccountType; cents: number };

export type NetWorth = {
  currency: string;
  /** Money held: chequing, savings, prepaid and cash (an overdraft counts against it). */
  assetsCents: number;
  /** Money owed: cards, lines of credit and loans (a credit balance counts against it). */
  debtsCents: number;
  netCents: number;
  assets: TypeTotal[];
  debts: TypeTotal[];
};

/** Add amounts by account type, largest first, dropping types that come to zero. */
function byType(entries: readonly { type: AccountType; cents: number }[]): TypeTotal[] {
  const totals = new Map<AccountType, number>();
  for (const { type, cents } of entries) totals.set(type, (totals.get(type) ?? 0) + cents);
  return [...totals]
    .map(([type, cents]) => ({ type, cents }))
    .filter((t) => t.cents !== 0)
    .sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents));
}

function groupByCurrency(accounts: readonly PositionAccount[]) {
  const groups = new Map<string, PositionAccount[]>();
  for (const a of accounts) {
    if (a.isArchived) continue;
    groups.set(a.currency, [...(groups.get(a.currency) ?? []), a]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b));
}

/** Everything held minus everything owed, per currency. Archived accounts are left out. */
export function netWorth(accounts: readonly PositionAccount[]): NetWorth[] {
  return groupByCurrency(accounts).map(([currency, list]) => {
    const assets = list.filter((a) => !isLiabilityAccount(a.type));
    const debts = list.filter((a) => isLiabilityAccount(a.type));
    const assetsCents = assets.reduce((sum, a) => sum + a.balanceCents, 0);
    const debtsCents = debts.reduce((sum, a) => sum + a.balanceCents, 0);
    return {
      currency,
      assetsCents,
      debtsCents,
      netCents: assetsCents - debtsCents,
      assets: byType(assets.map((a) => ({ type: a.type, cents: a.balanceCents }))),
      debts: byType(debts.map((a) => ({ type: a.type, cents: a.balanceCents }))),
    };
  });
}

/** Accounts whose money is for everyday spending. Savings is set aside, so it isn't counted. */
export const SPENDING_CASH_TYPES: readonly AccountType[] = ['debit', 'prepaid', 'cash'];

/** How far ahead "safe to spend" looks for payments and bills. */
export const SAFE_TO_SPEND_DAYS = 30;

/** A card or line-of-credit payment coming due, with what's owed on it now. */
export type PaymentDue = { currency: string; owedCents: number; daysUntil: number };

/** One upcoming recurring charge (negative) or income (positive) and the account it's on. */
export type UpcomingBill = {
  currency: string;
  amountCents: number;
  accountType: AccountType;
  daysUntil: number;
};

export type SafeToSpend = {
  currency: string;
  /** Chequing, prepaid and cash on hand. */
  cashCents: number;
  /** Card and line-of-credit payments due in the window (what's owed on them today). */
  paymentsDueCents: number;
  /** Recurring charges taken straight from spending accounts in the window. */
  billsCents: number;
  /** cash − payments due − bills; negative means a shortfall. */
  safeCents: number;
  /** Shown beside the result, never added to it: borrowing room isn't spending money. */
  availableCreditCents: number;
  /** Savings, shown for context; also not added. */
  savingsCents: number;
};

/**
 * Money that's safe to spend over the next `days`: spending cash, less card payments falling due
 * and bills paid from those accounts. Deliberately conservative: expected income isn't counted
 * (it may not arrive), and neither is available credit or savings.
 *
 * Charges on a credit card aren't bills here: they add to the card's balance, which is paid
 * through its own payment due date. Loans aren't "payments due" either; their monthly payment is a
 * recurring bill on the account it's paid from.
 */
export function safeToSpend(
  accounts: readonly PositionAccount[],
  paymentsDue: readonly PaymentDue[],
  bills: readonly UpcomingBill[],
  days = SAFE_TO_SPEND_DAYS,
): SafeToSpend[] {
  return groupByCurrency(accounts)
    .filter(([, list]) => list.some((a) => SPENDING_CASH_TYPES.includes(a.type)))
    .map(([currency, list]) => {
      const sum = (type: (t: AccountType) => boolean, pick: (a: PositionAccount) => number) =>
        list.filter((a) => type(a.type)).reduce((total, a) => total + pick(a), 0);
      const cashCents = sum(
        (t) => SPENDING_CASH_TYPES.includes(t),
        (a) => a.balanceCents,
      );
      const paymentsDueCents = paymentsDue
        .filter((p) => p.currency === currency && p.daysUntil <= days && p.owedCents > 0)
        .reduce((total, p) => total + p.owedCents, 0);
      const billsCents = bills
        .filter(
          (b) =>
            b.currency === currency &&
            b.daysUntil >= 0 &&
            b.daysUntil <= days &&
            b.amountCents < 0 &&
            SPENDING_CASH_TYPES.includes(b.accountType),
        )
        .reduce((total, b) => total - b.amountCents, 0);
      return {
        currency,
        cashCents,
        paymentsDueCents,
        billsCents,
        safeCents: cashCents - paymentsDueCents - billsCents,
        availableCreditCents: sum(isLiabilityAccount, (a) =>
          Math.max(0, a.availableCreditCents ?? 0),
        ),
        savingsCents: sum(
          (t) => t === 'savings',
          (a) => a.balanceCents,
        ),
      };
    });
}
