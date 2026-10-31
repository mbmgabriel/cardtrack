import { asc, count, eq, max } from 'drizzle-orm';

import { isISODate } from '@/domain/dates';
import { assertCents } from '@/domain/money';
import { assertValidLast4 } from '@/domain/validation';
import { newId, nowTimestamp } from '@/utils/id';

import { accounts, transactions, type Account, type NewAccount } from '../schema';
import type { AppDatabase } from '../types';

export type AccountInput = Omit<NewAccount, 'id' | 'sortOrder' | 'createdAt' | 'updatedAt'>;
export type AccountPatch = Partial<AccountInput>;

function validate(input: AccountPatch): void {
  assertValidLast4(input.last4);
  if (input.openingBalanceCents !== undefined) {
    assertCents(input.openingBalanceCents, 'openingBalanceCents');
  }
  if (input.creditLimitCents != null) {
    assertCents(input.creditLimitCents, 'creditLimitCents');
    if (input.creditLimitCents < 0) throw new RangeError('creditLimitCents must not be negative');
  }
  if (input.openingBalanceDate !== undefined && !isISODate(input.openingBalanceDate)) {
    throw new RangeError('openingBalanceDate must be YYYY-MM-DD');
  }
  const day = input.statementDay;
  if (day != null && (!Number.isInteger(day) || day < 1 || day > 31)) {
    throw new RangeError('statementDay must be 1–31');
  }
  const offset = input.dueDayOffset;
  if (offset != null && (!Number.isInteger(offset) || offset < 0)) {
    throw new RangeError('dueDayOffset must be a non-negative integer');
  }
}

export function createAccountsRepository(db: AppDatabase) {
  function listQuery({ includeArchived = false } = {}) {
    return db
      .select()
      .from(accounts)
      .where(includeArchived ? undefined : eq(accounts.isArchived, false))
      .orderBy(asc(accounts.sortOrder), asc(accounts.createdAt));
  }

  function getById(id: string): Account | undefined {
    return db.select().from(accounts).where(eq(accounts.id, id)).get();
  }

  function create(input: AccountInput): Account {
    validate(input);
    const id = newId();
    const last = db
      .select({ value: max(accounts.sortOrder) })
      .from(accounts)
      .get();
    db.insert(accounts)
      .values({ ...input, id, sortOrder: (last?.value ?? -1) + 1 })
      .run();
    return getById(id)!;
  }

  function update(id: string, patch: AccountPatch): Account | undefined {
    validate(patch);
    db.update(accounts)
      .set({ ...patch, updatedAt: nowTimestamp() })
      .where(eq(accounts.id, id))
      .run();
    return getById(id);
  }

  return {
    listQuery,
    list: (opts?: { includeArchived?: boolean }) => listQuery(opts).all(),
    getById,
    create,
    update,
    setArchived: (id: string, isArchived: boolean) => update(id, { isArchived }),

    /** Custom card artwork (a path under the documents folder), or null for the plain colour. */
    setImagePath: (id: string, imagePath: string | null) => update(id, { imagePath }),

    /** Persist a new tile order; `ids` is the full list in display order. */
    reorder(ids: readonly string[]): void {
      const timestamp = nowTimestamp();
      db.transaction((tx) => {
        ids.forEach((id, sortOrder) => {
          tx.update(accounts)
            .set({ sortOrder, updatedAt: timestamp })
            .where(eq(accounts.id, id))
            .run();
        });
      });
    },

    /** For the delete confirmation ("this will delete N transactions"). */
    countTransactions(id: string): number {
      return (
        db.select({ n: count() }).from(transactions).where(eq(transactions.accountId, id)).get()
          ?.n ?? 0
      );
    },

    /** Deletes the account and, via ON DELETE CASCADE, all its transactions, rules and statements. */
    delete(id: string): void {
      db.delete(accounts).where(eq(accounts.id, id)).run();
    },
  };
}

export type AccountsRepository = ReturnType<typeof createAccountsRepository>;
