import { count, desc, eq } from 'drizzle-orm';

import { newId, nowTimestamp } from '@/utils/id';

import { importBatches, transactions, type ImportBatch } from '../schema';
import type { AppDatabase } from '../types';

import { toRow, type TransactionInput } from './transactions';

export type NewImport = {
  accountId: string;
  fileName: string;
  skippedDuplicates: number;
  /** The rows to add; `importBatchId` is filled in here. */
  rows: readonly Omit<TransactionInput, 'importBatchId'>[];
};

export function createImportsRepository(db: AppDatabase) {
  function getById(id: string): ImportBatch | undefined {
    return db.select().from(importBatches).where(eq(importBatches.id, id)).get();
  }

  return {
    getById,

    listByAccount(accountId: string): ImportBatch[] {
      return db
        .select()
        .from(importBatches)
        .where(eq(importBatches.accountId, accountId))
        .orderBy(desc(importBatches.importedAt))
        .all();
    },

    /** Record the batch and insert its rows in one database transaction. */
    create({ accountId, fileName, skippedDuplicates, rows }: NewImport): ImportBatch {
      const id = newId();
      const prepared = rows.map((row) => toRow({ ...row, accountId, importBatchId: id }));
      db.transaction((tx) => {
        tx.insert(importBatches)
          .values({
            id,
            accountId,
            fileName,
            importedAt: nowTimestamp(),
            rowCount: prepared.length,
            skippedDuplicates,
          })
          .run();
        for (const row of prepared) tx.insert(transactions).values(row).run();
      });
      return getById(id)!;
    },

    /** How many transactions from the batch still exist (for the undo confirmation). */
    countTransactions(id: string): number {
      return (
        db.select({ n: count() }).from(transactions).where(eq(transactions.importBatchId, id)).get()
          ?.n ?? 0
      );
    },

    /** Undo an import: delete its transactions (edited or not) and the batch record. */
    undo(id: string): void {
      db.transaction((tx) => {
        tx.delete(transactions).where(eq(transactions.importBatchId, id)).run();
        tx.delete(importBatches).where(eq(importBatches.id, id)).run();
      });
    },
  };
}

export type ImportsRepository = ReturnType<typeof createImportsRepository>;
