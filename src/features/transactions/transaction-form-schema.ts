/**
 * Transaction form values are what the user typed; the amount is always entered as a positive
 * number and the type (or the direction, for transfers/adjustments) decides the sign.
 */
import { z } from 'zod';

import type { TransactionInput, TransactionPatch } from '@/db/repositories/transactions';
import type { Account, Transaction } from '@/db/schema';
import { isISODate } from '@/domain/dates';
import { centsToInputString, parseMoneyToCents } from '@/domain/money';
import {
  buildTransferPair,
  directionOf,
  isTransferType,
  signedAmountCents,
  TYPE_DIRECTION,
  type Direction,
} from '@/domain/transactions';
import {
  isLiabilityAccount,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  type TransactionStatus,
  type TransactionType,
} from '@/domain/types';

export const TRANSFERS_CATEGORY_ID = 'sys-transfers';

export type TransactionFormValues = {
  amount: string;
  direction: Direction;
  payee: string;
  accountId: string;
  /** For transfers and card payments: the user's other account, or '' for none. */
  otherAccountId: string;
  date: string;
  type: TransactionType;
  status: TransactionStatus;
  categoryId: string;
  notes: string;
};

const E = 'transactionForm.errors.';

/** Whether the form will create a linked pair rather than a single transaction. */
export function isLinkedTransfer(v: Pick<TransactionFormValues, 'type' | 'otherAccountId'>) {
  return isTransferType(v.type) && v.otherAccountId !== '';
}

export function transactionFormSchema(locale: string) {
  return z
    .object({
      amount: z.string(),
      direction: z.enum(['out', 'in']),
      payee: z.string().trim().max(100, `${E}payeeTooLong`),
      accountId: z.string().min(1, `${E}accountRequired`),
      otherAccountId: z.string(),
      date: z.string(),
      type: z.enum(TRANSACTION_TYPES),
      status: z.enum(TRANSACTION_STATUSES),
      categoryId: z.string(),
      notes: z.string().max(500, `${E}notesTooLong`),
    })
    .superRefine((v, ctx) => {
      const issue = (path: keyof TransactionFormValues, message: string) =>
        ctx.addIssue({ code: 'custom', path: [path], message: `${E}${message}` });

      const cents = parseMoneyToCents(v.amount, locale);
      if (cents == null || cents <= 0) issue('amount', 'amount');
      if (!isISODate(v.date)) issue('date', 'date');
      // Linked transfers get a generated payee when left blank.
      if (v.payee.trim() === '' && !isLinkedTransfer(v)) issue('payee', 'payeeRequired');
      if (isLinkedTransfer(v) && v.otherAccountId === v.accountId) {
        issue('otherAccountId', 'sameAccount');
      }
    });
}

export function defaultTransactionFormValues({
  accountId,
  today,
  status = 'posted',
}: {
  accountId: string;
  today: string;
  status?: TransactionStatus;
}): TransactionFormValues {
  return {
    amount: '',
    direction: 'out',
    payee: '',
    accountId,
    otherAccountId: '',
    date: today,
    type: 'purchase',
    status,
    categoryId: '',
    notes: '',
  };
}

/** Pre-fill from an existing transaction (edit, or duplicate with a new date). */
export function transactionToFormValues(
  tx: Transaction,
  locale: string,
  counterpart?: Pick<Transaction, 'accountId'>,
): TransactionFormValues {
  return {
    amount: centsToInputString(Math.abs(tx.amountCents), locale),
    direction: directionOf(tx.amountCents),
    payee: tx.payee,
    accountId: tx.accountId,
    otherAccountId: counterpart?.accountId ?? '',
    date: tx.date,
    type: tx.type,
    status: tx.status,
    categoryId: tx.categoryId ?? '',
    notes: tx.notes ?? '',
  };
}

/**
 * Linked transfers always follow the chosen direction (paying a card is money out of chequing even
 * though the type is "payment"); everything else follows its type.
 */
function signedAmount(v: TransactionFormValues, locale: string): number {
  const magnitude = parseMoneyToCents(v.amount, locale) ?? 0;
  return isLinkedTransfer(v)
    ? signedAmountCents('adjustment', magnitude, v.direction)
    : signedAmountCents(v.type, magnitude, v.direction);
}

/** Sensible direction when the type changes: card payments arrive on a card and leave anything else. */
export function directionForType(
  type: TransactionType,
  accountType: Account['type'] | undefined,
  current: Direction,
): Direction {
  if (type === 'payment') {
    return accountType && !isLiabilityAccount(accountType) ? 'out' : 'in';
  }
  return TYPE_DIRECTION[type] ?? current;
}

/** Payees for both sides of a linked transfer, e.g. "Payment to Visa" / "Payment from Chequing". */
export type TransferPayeeLabels = {
  to: (name: string, isPayment: boolean) => string;
  from: (name: string, isPayment: boolean) => string;
};

export type FormAccount = Pick<Account, 'id' | 'name' | 'type'>;

export type SaveTransaction =
  | { kind: 'single'; input: TransactionInput }
  | { kind: 'transfer'; pair: [TransactionInput, TransactionInput] };

/** Convert validated values into what the repository needs for a new transaction or transfer. */
export function toNewTransaction(
  v: TransactionFormValues,
  {
    locale,
    accounts,
    labels,
    newGroupId,
  }: {
    locale: string;
    accounts: ReadonlyMap<string, FormAccount>;
    labels: TransferPayeeLabels;
    newGroupId: () => string;
  },
): SaveTransaction {
  const amountCents = signedAmount(v, locale);
  const notes = v.notes.trim() === '' ? null : v.notes.trim();
  const self = accounts.get(v.accountId);
  const other = isLinkedTransfer(v) ? accounts.get(v.otherAccountId) : undefined;

  if (!self || !other) {
    return {
      kind: 'single',
      input: {
        accountId: v.accountId,
        date: v.date,
        payee: v.payee.trim(),
        amountCents,
        type: v.type,
        status: v.status,
        categoryId: v.categoryId === '' ? null : v.categoryId,
        notes,
      },
    };
  }

  // Money leaves `source` and arrives at `destination`; paying down debt makes it a payment.
  const outgoing = amountCents <= 0;
  const [source, destination] = outgoing ? [self, other] : [other, self];
  const isPayment = isLiabilityAccount(destination.type);
  const selfDefault = outgoing
    ? labels.to(destination.name, isPayment)
    : labels.from(source.name, isPayment);
  const otherPayee = outgoing
    ? labels.from(source.name, isPayment)
    : labels.to(destination.name, isPayment);

  const [a, b] = buildTransferPair({
    self: { accountId: self.id, accountType: self.type, payee: v.payee.trim() || selfDefault },
    other: { accountId: other.id, accountType: other.type, payee: otherPayee },
    amountCents,
    date: v.date,
    status: v.status,
    categoryId: v.categoryId === '' ? TRANSFERS_CATEGORY_ID : v.categoryId,
    notes,
    transferGroupId: newGroupId(),
  });
  return { kind: 'transfer', pair: [a, b] };
}

/**
 * The patch for editing an existing transaction. Linked transfers keep their account and type
 * (the repository mirrors amount, date, status, notes and category onto the other side).
 */
export function toTransactionPatch(
  v: TransactionFormValues,
  existing: Transaction,
  locale: string,
): TransactionPatch {
  const linked = existing.transferGroupId != null;
  // A linked side keeps its direction; only its size changes.
  const amountCents = linked
    ? signedAmountCents(
        'adjustment',
        parseMoneyToCents(v.amount, locale) ?? 0,
        directionOf(existing.amountCents),
      )
    : signedAmount(v, locale);
  return {
    amountCents,
    payee: v.payee.trim() || existing.payee,
    date: v.date,
    status: v.status,
    categoryId: v.categoryId === '' ? null : v.categoryId,
    notes: v.notes.trim() === '' ? null : v.notes.trim(),
    ...(linked ? {} : { accountId: v.accountId, type: v.type }),
  };
}

/** Types offered in the form, most common first. */
export const FORM_TYPES: readonly TransactionType[] = [
  'purchase',
  'refund',
  'payment',
  'transfer',
  'deposit',
  'withdrawal',
  'fee',
  'interest',
  'cash_advance',
  'adjustment',
];

/** Whether the user has to say which way the money moves. */
export function needsDirection(v: Pick<TransactionFormValues, 'type' | 'otherAccountId'>): boolean {
  return TYPE_DIRECTION[v.type] == null || isLinkedTransfer(v);
}
