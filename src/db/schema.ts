/**
 * SQLite schema (PLAN.md §4). DB columns are snake_case, TS properties camelCase.
 * After changing this file run `npm run db:generate` to create a migration.
 */
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

import {
  ACCOUNT_TYPES,
  CARD_NETWORKS,
  RECURRING_FREQUENCIES,
  STATEMENT_STATUSES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from '@/domain/types';

const timestamps = {
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
};

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  institution: text('institution').notNull().default(''),
  type: text('type', { enum: ACCOUNT_TYPES }).notNull(),
  network: text('network', { enum: CARD_NETWORKS }),
  last4: text('last4'),
  currency: text('currency').notNull().default('CAD'),
  color: text('color').notNull().default('#1565C0'),
  /** Custom card artwork (Pro): a file under the app's documents folder, relative path. */
  imagePath: text('image_path'),
  creditLimitCents: integer('credit_limit_cents'),
  openingBalanceCents: integer('opening_balance_cents').notNull().default(0),
  openingBalanceDate: text('opening_balance_date').notNull(),
  statementDay: integer('statement_day'),
  dueDayOffset: integer('due_day_offset'),
  interestRateBps: integer('interest_rate_bps'),
  isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  icon: text('icon').notNull().default('tag-outline'),
  color: text('color').notNull().default('#757575'),
  parentId: text('parent_id').references((): AnySQLiteColumn => categories.id, {
    onDelete: 'set null',
  }),
  isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const recurringRules = sqliteTable(
  'recurring_rules',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    payee: text('payee').notNull(),
    amountCents: integer('amount_cents').notNull(),
    categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
    frequency: text('frequency', { enum: RECURRING_FREQUENCIES }).notNull(),
    interval: integer('interval').notNull().default(1),
    anchorDate: text('anchor_date').notNull(),
    nextDate: text('next_date').notNull(),
    endDate: text('end_date'),
    autoCreate: integer('auto_create', { mode: 'boolean' }).notNull().default(false),
    remindDaysBefore: integer('remind_days_before').notNull().default(0),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [index('recurring_rules_account_idx').on(t.accountId)],
);

/**
 * Instalment plans on a card or line of credit (e.g. a $1,200 purchase paid as 12 × $100). The
 * purchase itself is part of the card's balance; the plan says how it's billed each month.
 */
export const installmentPlans = sqliteTable(
  'installment_plans',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    principalCents: integer('principal_cents').notNull(),
    months: integer('months').notNull(),
    monthlyCents: integer('monthly_cents').notNull(),
    monthlyFeeCents: integer('monthly_fee_cents').notNull().default(0),
    /** Date of the first instalment; the rest fall on the same day of each following month. */
    firstPaymentDate: text('first_payment_date').notNull(),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [index('installment_plans_account_idx').on(t.accountId)],
);

export const statements = sqliteTable(
  'statements',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    periodStart: text('period_start').notNull(),
    periodEnd: text('period_end').notNull(),
    closingBalanceCents: integer('closing_balance_cents'),
    minimumPaymentCents: integer('minimum_payment_cents'),
    dueDate: text('due_date').notNull(),
    amountPaidCents: integer('amount_paid_cents').notNull().default(0),
    status: text('status', { enum: STATEMENT_STATUSES }).notNull().default('open'),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [index('statements_account_period_idx').on(t.accountId, t.periodEnd)],
);

export const importBatches = sqliteTable('import_batches', {
  id: text('id').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  importedAt: text('imported_at').notNull(),
  rowCount: integer('row_count').notNull().default(0),
  skippedDuplicates: integer('skipped_duplicates').notNull().default(0),
});

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    postedDate: text('posted_date'),
    payee: text('payee').notNull(),
    amountCents: integer('amount_cents').notNull(),
    type: text('type', { enum: TRANSACTION_TYPES }).notNull(),
    status: text('status', { enum: TRANSACTION_STATUSES }).notNull().default('posted'),
    categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
    notes: text('notes'),
    recurringId: text('recurring_id').references(() => recurringRules.id, {
      onDelete: 'set null',
    }),
    statementId: text('statement_id').references(() => statements.id, { onDelete: 'set null' }),
    transferGroupId: text('transfer_group_id'),
    importBatchId: text('import_batch_id').references(() => importBatches.id, {
      onDelete: 'set null',
    }),
    dedupeHash: text('dedupe_hash').notNull(),
    isReconciled: integer('is_reconciled', { mode: 'boolean' }).notNull().default(false),
    ...timestamps,
  },
  (t) => [
    // SQLite walks indexes in either direction, so this also serves ORDER BY date DESC.
    index('transactions_account_date_idx').on(t.accountId, t.date),
    index('transactions_category_idx').on(t.categoryId),
    index('transactions_status_idx').on(t.status),
    index('transactions_dedupe_idx').on(t.dedupeHash),
    index('transactions_transfer_group_idx').on(t.transferGroupId),
  ],
);

export const csvMappings = sqliteTable('csv_mappings', {
  id: text('id').primaryKey(),
  institution: text('institution').notNull(),
  name: text('name').notNull(),
  dateCol: text('date_col').notNull(),
  dateFormat: text('date_format').notNull(),
  payeeCol: text('payee_col').notNull(),
  amountCol: text('amount_col'),
  debitCol: text('debit_col'),
  creditCol: text('credit_col'),
  invertSign: integer('invert_sign', { mode: 'boolean' }).notNull().default(false),
  hasHeader: integer('has_header', { mode: 'boolean' }).notNull().default(true),
});

/** Key/value store; values are JSON-encoded. Typed access lives in the settings repository. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type InstallmentPlan = typeof installmentPlans.$inferSelect;
export type NewInstallmentPlan = typeof installmentPlans.$inferInsert;
export type RecurringRule = typeof recurringRules.$inferSelect;
export type NewRecurringRule = typeof recurringRules.$inferInsert;
export type Statement = typeof statements.$inferSelect;
export type NewStatement = typeof statements.$inferInsert;
export type ImportBatch = typeof importBatches.$inferSelect;
export type CsvMapping = typeof csvMappings.$inferSelect;
