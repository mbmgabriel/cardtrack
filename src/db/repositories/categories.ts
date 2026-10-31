import { asc, count, eq, max } from 'drizzle-orm';

import { newId } from '@/utils/id';

import { categories, transactions, type Category, type NewCategory } from '../schema';
import type { AppDatabase } from '../types';

/**
 * Built-in categories (PLAN.md §4). Ids are stable so the UI can translate them via
 * `categories.<id>` in the locale files; `name` is the en-CA fallback.
 */
export const DEFAULT_CATEGORIES: readonly Omit<NewCategory, 'isSystem' | 'sortOrder'>[] = [
  { id: 'sys-groceries', name: 'Groceries', icon: 'cart-outline', color: '#2E7D32' },
  { id: 'sys-dining', name: 'Dining', icon: 'silverware-fork-knife', color: '#EF6C00' },
  { id: 'sys-gas-transit', name: 'Gas & Transit', icon: 'gas-station-outline', color: '#5D4037' },
  { id: 'sys-shopping', name: 'Shopping', icon: 'shopping-outline', color: '#AD1457' },
  { id: 'sys-bills', name: 'Bills & Utilities', icon: 'flash-outline', color: '#F9A825' },
  { id: 'sys-subscriptions', name: 'Subscriptions', icon: 'autorenew', color: '#6A1B9A' },
  { id: 'sys-travel', name: 'Travel', icon: 'airplane', color: '#0277BD' },
  { id: 'sys-health', name: 'Health', icon: 'medical-bag', color: '#C62828' },
  { id: 'sys-entertainment', name: 'Entertainment', icon: 'movie-open-outline', color: '#4527A0' },
  { id: 'sys-housing', name: 'Housing', icon: 'home-outline', color: '#00695C' },
  { id: 'sys-insurance', name: 'Insurance', icon: 'shield-check-outline', color: '#37474F' },
  { id: 'sys-education', name: 'Education', icon: 'school-outline', color: '#1565C0' },
  { id: 'sys-fees-interest', name: 'Fees & Interest', icon: 'percent-outline', color: '#B71C1C' },
  { id: 'sys-income', name: 'Income', icon: 'cash-plus', color: '#1B5E20' },
  { id: 'sys-transfers', name: 'Transfers', icon: 'swap-horizontal', color: '#546E7A' },
  { id: 'sys-other', name: 'Other', icon: 'dots-horizontal-circle-outline', color: '#757575' },
];

export type CategoryInput = Omit<NewCategory, 'id' | 'isSystem' | 'sortOrder'>;

export function createCategoriesRepository(db: AppDatabase) {
  function listQuery() {
    return db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
  }

  function getById(id: string): Category | undefined {
    return db.select().from(categories).where(eq(categories.id, id)).get();
  }

  return {
    listQuery,
    list: () => listQuery().all(),
    getById,

    /** Insert any missing built-in categories. Safe to run on every launch; keeps user renames. */
    seedDefaults(): void {
      db.transaction((tx) => {
        DEFAULT_CATEGORIES.forEach((category, sortOrder) => {
          tx.insert(categories)
            .values({ ...category, isSystem: true, sortOrder })
            .onConflictDoNothing()
            .run();
        });
      });
    },

    create(input: CategoryInput): Category {
      const id = newId();
      const last = db
        .select({ value: max(categories.sortOrder) })
        .from(categories)
        .get();
      db.insert(categories)
        .values({ ...input, id, isSystem: false, sortOrder: (last?.value ?? -1) + 1 })
        .run();
      return getById(id)!;
    },

    update(id: string, patch: Partial<CategoryInput & { sortOrder: number }>) {
      db.update(categories).set(patch).where(eq(categories.id, id)).run();
      return getById(id);
    },

    /** For the delete confirmation ("N transactions will become uncategorized"). */
    countTransactions(id: string): number {
      return (
        db.select({ n: count() }).from(transactions).where(eq(transactions.categoryId, id)).get()
          ?.n ?? 0
      );
    },

    /** Built-in categories can be renamed but not deleted. Transactions keep a null category. */
    delete(id: string): void {
      const category = getById(id);
      if (category?.isSystem) throw new Error('Built-in categories cannot be deleted');
      db.delete(categories).where(eq(categories.id, id)).run();
    },
  };
}

export type CategoriesRepository = ReturnType<typeof createCategoriesRepository>;
