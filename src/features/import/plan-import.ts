import type { TransactionInput } from '@/db/repositories/transactions';
import { importedTransactionType, payeeCategoryKey, type ParsedRow } from '@/domain/csv';
import { computeDedupeHash, partitionDuplicates } from '@/domain/dedupe';
import type { AccountType, TransactionType } from '@/domain/types';

export type PlannedRow = ParsedRow & {
  type: TransactionType;
  categoryId: string | null;
  dedupeHash: string;
};

export type ImportPlan = {
  /** Rows that will be added. */
  fresh: PlannedRow[];
  /** Rows already in the account (same date, amount and payee), skipped. */
  duplicates: PlannedRow[];
};

/**
 * Decide what an import will do: give each row a type and the category last used for its payee,
 * then split off rows that duplicate existing transactions (matched per occurrence, so two
 * identical coffees are both kept unless two already exist).
 */
export function planImport(
  rows: readonly ParsedRow[],
  {
    accountId,
    accountType,
    existingHashes,
    categoryMemory,
  }: {
    accountId: string;
    accountType: AccountType;
    existingHashes: Iterable<string>;
    categoryMemory: ReadonlyMap<string, string>;
  },
): ImportPlan {
  const planned = rows.map((row) => ({
    ...row,
    type: importedTransactionType(accountType, row.amountCents, row.payee),
    categoryId: categoryMemory.get(payeeCategoryKey(row.payee)) ?? null,
    dedupeHash: computeDedupeHash({ accountId, ...row }),
  }));
  const { fresh, duplicates } = partitionDuplicates(planned, existingHashes);
  return { fresh, duplicates };
}

/** What gets inserted for a planned row, with the category the user settled on. */
export function toImportInput(
  row: PlannedRow,
  accountId: string,
  categoryId: string | null,
): Omit<TransactionInput, 'importBatchId'> {
  return {
    accountId,
    date: row.date,
    payee: row.payee,
    amountCents: row.amountCents,
    type: row.type,
    status: 'posted',
    categoryId,
  };
}
