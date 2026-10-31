/** Enumerations shared by the database schema, domain logic and UI (PLAN.md §4). */

export const ACCOUNT_TYPES = [
  'credit',
  'debit',
  'savings',
  'line_of_credit',
  'loan',
  'prepaid',
  'cash',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const CARD_NETWORKS = ['visa', 'mastercard', 'amex', 'interac', 'other'] as const;
export type CardNetwork = (typeof CARD_NETWORKS)[number];

export const TRANSACTION_TYPES = [
  'purchase',
  'refund',
  'payment',
  'transfer',
  'fee',
  'interest',
  'cash_advance',
  'deposit',
  'withdrawal',
  'adjustment',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = ['pending', 'posted', 'void'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const RECURRING_FREQUENCIES = [
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'yearly',
] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export const STATEMENT_STATUSES = ['open', 'due', 'paid', 'overdue'] as const;
export type StatementStatus = (typeof STATEMENT_STATUSES)[number];

/** Accounts where the balance is money owed (shown as a positive "Owed" figure). */
export function isLiabilityAccount(type: AccountType): boolean {
  return type === 'credit' || type === 'line_of_credit' || type === 'loan';
}

/** Account types that have a physical card, so network and last 4 digits apply. */
export function hasCardDetails(type: AccountType): boolean {
  return type === 'credit' || type === 'debit' || type === 'prepaid';
}
