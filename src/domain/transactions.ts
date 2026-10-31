/**
 * Transaction rules (PLAN.md §3.2, §5, §7). People enter a positive amount; the type (and, for
 * types that can go either way, a direction) decides the stored sign.
 */
import { countsTowardBalance } from './balances';
import { parseMoneyToCents } from './money';
import {
  isLiabilityAccount,
  type AccountType,
  type TransactionStatus,
  type TransactionType,
} from './types';

export type Direction = 'out' | 'in';

/** Which way money moves for each type; `null` means the user picks (transfers, adjustments). */
export const TYPE_DIRECTION: Record<TransactionType, Direction | null> = {
  purchase: 'out',
  fee: 'out',
  interest: 'out',
  cash_advance: 'out',
  withdrawal: 'out',
  refund: 'in',
  payment: 'in',
  deposit: 'in',
  transfer: null,
  adjustment: null,
};

/** Types that can be linked to a second account of the user's (PLAN.md §5 card payment). */
export function isTransferType(type: TransactionType): boolean {
  return type === 'transfer' || type === 'payment';
}

/** The direction a type implies, or `chosen` when the type goes either way. */
export function directionFor(type: TransactionType, chosen: Direction): Direction {
  return TYPE_DIRECTION[type] ?? chosen;
}

/** Apply the sign convention to a positive amount the user typed. */
export function signedAmountCents(
  type: TransactionType,
  magnitudeCents: number,
  chosen: Direction = 'out',
): number {
  const abs = Math.abs(magnitudeCents);
  if (abs === 0) return 0;
  return directionFor(type, chosen) === 'out' ? -abs : abs;
}

/** The direction stored in a signed amount (zero counts as "out", the common case). */
export function directionOf(amountCents: number): Direction {
  return amountCents > 0 ? 'in' : 'out';
}

/**
 * The type each side of a transfer gets: money arriving on a credit card / LOC is a payment,
 * everything else is a transfer.
 */
export function transferSideType(accountType: AccountType, amountCents: number): TransactionType {
  return isLiabilityAccount(accountType) && amountCents > 0 ? 'payment' : 'transfer';
}

export type TransferSide = { accountId: string; accountType: AccountType; payee: string };

export type TransferPairInput = {
  /** The account the user is entering the transaction on. */
  self: TransferSide;
  /** The user's other account on the far side of the transfer. */
  other: TransferSide;
  /** Signed amount on `self`; the other side gets the opposite sign. */
  amountCents: number;
  date: string;
  status: TransactionStatus;
  categoryId: string | null;
  notes: string | null;
  transferGroupId: string;
};

export type TransferRow = {
  accountId: string;
  payee: string;
  amountCents: number;
  type: TransactionType;
  date: string;
  status: TransactionStatus;
  categoryId: string | null;
  notes: string | null;
  transferGroupId: string;
};

/** Both linked rows of a transfer: `[self, other]`. */
export function buildTransferPair(input: TransferPairInput): [TransferRow, TransferRow] {
  const { self, other, amountCents, ...shared } = input;
  const otherAmount = amountCents === 0 ? 0 : -amountCents;
  return [
    {
      ...shared,
      accountId: self.accountId,
      payee: self.payee,
      amountCents,
      type: transferSideType(self.accountType, amountCents),
    },
    {
      ...shared,
      accountId: other.accountId,
      payee: other.payee,
      amountCents: otherAmount,
      type: transferSideType(other.accountType, otherAmount),
    },
  ];
}

/** Fields that stay identical on both sides of a transfer. Payee and account are per side. */
const MIRRORED_FIELDS = ['date', 'postedDate', 'status', 'notes', 'categoryId'] as const;

export type MirrorablePatch = {
  amountCents?: number;
  date?: string;
  postedDate?: string | null;
  status?: TransactionStatus;
  notes?: string | null;
  categoryId?: string | null;
};

/** The patch to apply to the other side when one side of a transfer is edited. */
export function mirrorTransferPatch(patch: MirrorablePatch): MirrorablePatch {
  const mirrored: MirrorablePatch = {};
  for (const key of MIRRORED_FIELDS) {
    if (patch[key] !== undefined) (mirrored as Record<string, unknown>)[key] = patch[key];
  }
  if (patch.amountCents !== undefined) {
    mirrored.amountCents = patch.amountCents === 0 ? 0 : -patch.amountCents;
  }
  return mirrored;
}

export type BalanceRow = {
  id: string;
  date: string;
  amountCents: number;
  status: TransactionStatus;
};

/**
 * Posted balance right after each row, for rows sorted newest first (the list order).
 * `currentBalanceCents` is the account's posted balance now. Rows that don't move the balance
 * (pending, void, or dated before the opening balance) map to null.
 */
export function runningBalances(
  rowsNewestFirst: readonly BalanceRow[],
  currentBalanceCents: number,
  openingBalanceDate: string,
): Map<string, number | null> {
  const result = new Map<string, number | null>();
  let balance = currentBalanceCents;
  for (const row of rowsNewestFirst) {
    if (row.status !== 'posted' || !countsTowardBalance(row.date, openingBalanceDate)) {
      result.set(row.id, null);
      continue;
    }
    result.set(row.id, balance);
    balance -= row.amountCents;
  }
  return result;
}

export type DateSection<T> = { date: string; data: T[] };

/** Group rows (already sorted by date) into one section per date, keeping their order. */
export function groupByDate<T extends { date: string }>(rows: readonly T[]): DateSection<T>[] {
  const sections: DateSection<T>[] = [];
  for (const row of rows) {
    const last = sections[sections.length - 1];
    if (last && last.date === row.date) last.data.push(row);
    else sections.push({ date: row.date, data: [row] });
  }
  return sections;
}

export type SearchQuery = {
  /** Trimmed text to match against payee and notes; empty when there is none. */
  text: string;
  /** Set when the text reads as an amount; matches either sign. */
  amountCents: number | null;
};

/** "54.20" or "$54.20" also searches by amount; any text searches payee and notes. */
export function parseSearchQuery(input: string, locale = 'en-CA'): SearchQuery {
  const text = input.trim();
  if (text === '' || !/\d/.test(text)) return { text, amountCents: null };
  const cents = parseMoneyToCents(text, locale);
  return { text, amountCents: cents == null ? null : Math.abs(cents) };
}
