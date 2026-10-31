import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  max,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import type { TransactionTotals } from '@/domain/balances';
import { SPENDING_TYPES, type DateRange } from '@/domain/dashboard';
import { isISODate } from '@/domain/dates';
import { computeDedupeHash } from '@/domain/dedupe';
import { payeeCategoryKey } from '@/domain/csv';
import { assertCents } from '@/domain/money';
import { mirrorTransferPatch, type SearchQuery } from '@/domain/transactions';
import type { TransactionStatus, TransactionType } from '@/domain/types';
import { newId, nowTimestamp } from '@/utils/id';

import { accounts, transactions, type NewTransaction, type Transaction } from '../schema';
import type { AppDatabase } from '../types';

export type TransactionInput = Omit<
  NewTransaction,
  'id' | 'dedupeHash' | 'createdAt' | 'updatedAt'
>;
export type TransactionPatch = Partial<TransactionInput>;

export type TransactionFilters = {
  query?: SearchQuery;
  accountIds?: readonly string[];
  categoryIds?: readonly string[];
  types?: readonly TransactionType[];
  statuses?: readonly TransactionStatus[];
  /** Inclusive `YYYY-MM-DD` bounds on the transaction date. */
  from?: string;
  to?: string;
  limit?: number;
};

export type PayeeSuggestion = { payee: string; uses: number };

/** What the user last did with a payee, used to pre-fill quick-add. */
export type PayeeMemory = {
  accountId: string;
  type: TransactionType;
  categoryId: string | null;
};

/** LIKE pattern matching `text` anywhere, with LIKE wildcards in the text taken literally. */
function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function validate(input: TransactionPatch): void {
  if (input.amountCents !== undefined) assertCents(input.amountCents, 'amountCents');
  if (input.date !== undefined && !isISODate(input.date)) {
    throw new RangeError('date must be YYYY-MM-DD');
  }
  if (input.postedDate != null && !isISODate(input.postedDate)) {
    throw new RangeError('postedDate must be YYYY-MM-DD');
  }
}

/** Validate an input and give it an id and dedupe hash, ready to insert. */
export function toRow(input: TransactionInput): NewTransaction {
  validate(input);
  return { ...input, id: newId(), dedupeHash: computeDedupeHash(input) };
}

const DEFAULT_SEARCH_LIMIT = 500;

export function createTransactionsRepository(db: AppDatabase) {
  function getById(id: string, from: AppDatabase = db): Transaction | undefined {
    return from.select().from(transactions).where(eq(transactions.id, id)).get();
  }

  /** The other side of a transfer, if `transaction` is one. */
  function counterpartOf(
    transaction: Transaction,
    from: AppDatabase = db,
  ): Transaction | undefined {
    if (!transaction.transferGroupId) return undefined;
    return from
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.transferGroupId, transaction.transferGroupId),
          ne(transactions.id, transaction.id),
        ),
      )
      .get();
  }

  function applyPatch(tx: AppDatabase, existing: Transaction, patch: TransactionPatch): void {
    const merged = { ...existing, ...patch };
    tx.update(transactions)
      .set({ ...patch, dedupeHash: computeDedupeHash(merged), updatedAt: nowTimestamp() })
      .where(eq(transactions.id, existing.id))
      .run();
  }

  /**
   * Update a transaction. For one side of a transfer the shared fields (amount, dates, status,
   * notes, category) are mirrored onto the other side in the same database transaction.
   */
  function update(id: string, patch: TransactionPatch): Transaction | undefined {
    validate(patch);
    db.transaction((tx) => {
      const existing = getById(id, tx);
      if (!existing) return;
      applyPatch(tx, existing, patch);
      const other = counterpartOf(existing, tx);
      if (other) applyPatch(tx, other, mirrorTransferPatch(patch));
    });
    return getById(id);
  }

  function searchConditions(f: TransactionFilters): SQL | undefined {
    const conditions: (SQL | undefined)[] = [];
    if (f.query && f.query.text !== '') {
      const pattern = containsPattern(f.query.text);
      conditions.push(
        or(
          sql`${transactions.payee} like ${pattern} escape '\\'`,
          sql`${transactions.notes} like ${pattern} escape '\\'`,
          f.query.amountCents == null
            ? undefined
            : sql`abs(${transactions.amountCents}) = ${f.query.amountCents}`,
        ),
      );
    }
    if (f.accountIds?.length) conditions.push(inArray(transactions.accountId, [...f.accountIds]));
    if (f.categoryIds?.length) {
      conditions.push(inArray(transactions.categoryId, [...f.categoryIds]));
    }
    if (f.types?.length) conditions.push(inArray(transactions.type, [...f.types]));
    if (f.statuses?.length) conditions.push(inArray(transactions.status, [...f.statuses]));
    if (f.from) conditions.push(gte(transactions.date, f.from));
    if (f.to) conditions.push(lte(transactions.date, f.to));
    return and(...conditions);
  }

  function listByAccountQuery(accountId: string, { status }: { status?: TransactionStatus } = {}) {
    return db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, accountId),
          status ? eq(transactions.status, status) : undefined,
        ),
      )
      .orderBy(desc(transactions.date), desc(transactions.createdAt));
  }

  /**
   * Posted and pending sums per account in one query. Void rows and rows dated before the
   * account's opening-balance date are excluded (same rule as `totalsFromTransactions`).
   */
  function totalsQuery() {
    return db
      .select({
        accountId: transactions.accountId,
        postedCents: sql<number>`coalesce(sum(case when ${transactions.status} = 'posted' then ${transactions.amountCents} else 0 end), 0)`,
        pendingCents: sql<number>`coalesce(sum(case when ${transactions.status} = 'pending' then ${transactions.amountCents} else 0 end), 0)`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(gte(transactions.date, accounts.openingBalanceDate))
      .groupBy(transactions.accountId);
  }

  return {
    getById,
    listByAccountQuery,
    listByAccount: (accountId: string, opts?: { status?: TransactionStatus }) =>
      listByAccountQuery(accountId, opts).all(),
    totalsQuery,

    totalsByAccount(): Map<string, TransactionTotals> {
      return new Map(
        totalsQuery()
          .all()
          .map(({ accountId, postedCents, pendingCents }) => [
            accountId,
            { postedCents, pendingCents },
          ]),
      );
    },

    create(input: TransactionInput): Transaction {
      const row = toRow(input);
      db.insert(transactions).values(row).run();
      return getById(row.id)!;
    },

    /** Insert many rows atomically (CSV import, recurring generation). Returns the new ids. */
    createMany(inputs: readonly TransactionInput[]): string[] {
      const rows = inputs.map(toRow);
      db.transaction((tx) => {
        for (const row of rows) tx.insert(transactions).values(row).run();
      });
      return rows.map((row) => row.id);
    },

    /** Insert both sides of a transfer (see `buildTransferPair`) atomically. */
    createTransfer(
      pair: readonly [TransactionInput, TransactionInput],
    ): [Transaction, Transaction] {
      const [a, b] = pair;
      if (!a.transferGroupId || a.transferGroupId !== b.transferGroupId) {
        throw new Error('Both sides of a transfer need the same transferGroupId');
      }
      if (a.accountId === b.accountId) throw new Error('A transfer needs two different accounts');
      const rows = pair.map(toRow);
      db.transaction((tx) => {
        for (const row of rows) tx.insert(transactions).values(row).run();
      });
      return [getById(rows[0].id)!, getById(rows[1].id)!];
    },

    counterpart: (id: string) => {
      const transaction = getById(id);
      return transaction ? counterpartOf(transaction) : undefined;
    },

    update,

    /** Turn a pending hold into a posted transaction, optionally with the final amount. */
    markPosted(
      id: string,
      { amountCents, postedDate }: { amountCents?: number; postedDate: string },
    ): Transaction | undefined {
      return update(id, {
        status: 'posted',
        postedDate,
        ...(amountCents === undefined ? {} : { amountCents }),
      });
    },

    void(id: string): Transaction | undefined {
      return update(id, { status: 'void' });
    },

    /** Deletes the transaction, and the other side too when it is part of a transfer. */
    delete(id: string): void {
      const existing = getById(id);
      if (!existing) return;
      db.delete(transactions)
        .where(
          existing.transferGroupId
            ? eq(transactions.transferGroupId, existing.transferGroupId)
            : eq(transactions.id, id),
        )
        .run();
    },

    /** All accounts' transactions matching the filters, newest first. */
    search(filters: TransactionFilters = {}): Transaction[] {
      return db
        .select()
        .from(transactions)
        .where(searchConditions(filters))
        .orderBy(desc(transactions.date), desc(transactions.createdAt))
        .limit(filters.limit ?? DEFAULT_SEARCH_LIMIT)
        .all();
    },

    /**
     * Payees the user has typed before, most used first; payees that start with `text` rank above
     * ones that merely contain it. Transfer rows are skipped (their payees are generated).
     */
    payeeSuggestions(text: string, limit = 6): PayeeSuggestion[] {
      const trimmed = text.trim();
      const startsWith = `${containsPattern(trimmed).slice(1)}`;
      const uses = count();
      return db
        .select({ payee: transactions.payee, uses, lastDate: max(transactions.date) })
        .from(transactions)
        .where(
          and(
            isNull(transactions.transferGroupId),
            trimmed === ''
              ? undefined
              : sql`${transactions.payee} like ${containsPattern(trimmed)} escape '\\'`,
          ),
        )
        .groupBy(sql`lower(${transactions.payee})`)
        .orderBy(
          sql`case when ${transactions.payee} like ${startsWith} escape '\\' then 0 else 1 end`,
          desc(uses),
          desc(max(transactions.date)),
          asc(transactions.payee),
        )
        .limit(limit)
        .all()
        .filter((r) => r.payee.toLowerCase() !== trimmed.toLowerCase())
        .map(({ payee, uses: n }) => ({ payee, uses: n }));
    },

    /**
     * Net spending (positive = money spent) per currency in a date range, using the same rule as
     * `isSpending`. Archived accounts are left out, like every other total.
     */
    spendingByCurrency({ from, to }: DateRange): Map<string, number> {
      const rows = db
        .select({
          currency: accounts.currency,
          spentCents: sql<number>`coalesce(-sum(${transactions.amountCents}), 0)`,
        })
        .from(transactions)
        .innerJoin(accounts, eq(accounts.id, transactions.accountId))
        .where(
          and(
            inArray(transactions.type, [...SPENDING_TYPES]),
            ne(transactions.status, 'void'),
            isNull(transactions.transferGroupId),
            eq(accounts.isArchived, false),
            gte(transactions.date, from),
            lte(transactions.date, to),
          ),
        )
        .groupBy(accounts.currency)
        .all();
      return new Map(rows.map((r) => [r.currency, r.spentCents]));
    },

    /** Spending per (non-archived) account in a date range, as positive cents. */
    spendingByAccount({ from, to }: DateRange): Map<string, number> {
      const rows = db
        .select({
          accountId: transactions.accountId,
          spentCents: sql<number>`coalesce(-sum(${transactions.amountCents}), 0)`,
        })
        .from(transactions)
        .innerJoin(accounts, eq(accounts.id, transactions.accountId))
        .where(
          and(
            inArray(transactions.type, [...SPENDING_TYPES]),
            ne(transactions.status, 'void'),
            isNull(transactions.transferGroupId),
            eq(accounts.isArchived, false),
            gte(transactions.date, from),
            lte(transactions.date, to),
          ),
        )
        .groupBy(transactions.accountId)
        .all();
      return new Map(rows.map((r) => [r.accountId, r.spentCents]));
    },

    /**
     * The category most recently used for each payee, keyed by `payeeCategoryKey` so store
     * numbers and capitalization don't matter. Used to auto-categorize imports.
     */
    categoryMemory(): Map<string, string> {
      const rows = db
        .select({ payee: transactions.payee, categoryId: transactions.categoryId })
        .from(transactions)
        .where(and(isNotNull(transactions.categoryId), isNull(transactions.transferGroupId)))
        .orderBy(asc(transactions.date), asc(transactions.createdAt))
        .all();
      const memory = new Map<string, string>();
      for (const { payee, categoryId } of rows) memory.set(payeeCategoryKey(payee), categoryId!);
      return memory;
    },

    /** The account, type and category last used with this payee (case-insensitive). */
    payeeMemory(payee: string): PayeeMemory | undefined {
      const samePayee = and(
        sql`${transactions.payee} = ${payee.trim()} collate nocase`,
        isNull(transactions.transferGroupId),
      );
      const latest = db
        .select({ accountId: transactions.accountId, type: transactions.type })
        .from(transactions)
        .where(samePayee)
        .orderBy(desc(transactions.date), desc(transactions.createdAt))
        .get();
      if (!latest) return undefined;
      const categorized = db
        .select({ categoryId: transactions.categoryId })
        .from(transactions)
        .where(and(samePayee, isNotNull(transactions.categoryId)))
        .orderBy(desc(transactions.date), desc(transactions.createdAt))
        .get();
      return { ...latest, categoryId: categorized?.categoryId ?? null };
    },

    /** Every existing dedupe hash for an account, one entry per row (duplicates repeat). */
    dedupeHashes(accountId: string): string[] {
      return db
        .select({ hash: transactions.dedupeHash })
        .from(transactions)
        .where(eq(transactions.accountId, accountId))
        .all()
        .map((r) => r.hash);
    },
  };
}

export type TransactionsRepository = ReturnType<typeof createTransactionsRepository>;
