import Papa from 'papaparse';

import type { Account, Category, Transaction } from '@/db/schema';

export type CsvLabels = {
  headers: {
    date: string;
    account: string;
    payee: string;
    amount: string;
    currency: string;
    type: string;
    status: string;
    category: string;
    notes: string;
  };
  type: (type: Transaction['type']) => string;
  status: (status: Transaction['status']) => string;
  category: (category: Category) => string;
};

/**
 * A spreadsheet treats cells starting with = + - @ (or a tab/CR) as formulas; prefix text cells
 * with an apostrophe so a payee like "=HYPERLINK(...)" stays text. Amounts are numbers, not text.
 */
export function safeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Plain amount for spreadsheets: -1699 → "-16.99" (no symbol or grouping). */
export function centsToPlain(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function transactionsToCsv(
  rows: readonly Transaction[],
  {
    accounts,
    categories,
    labels,
  }: {
    accounts: ReadonlyMap<string, Account>;
    categories: ReadonlyMap<string, Category>;
    labels: CsvLabels;
  },
): string {
  const h = labels.headers;
  return Papa.unparse({
    fields: [
      h.date,
      h.account,
      h.payee,
      h.amount,
      h.currency,
      h.type,
      h.status,
      h.category,
      h.notes,
    ],
    data: rows.map((tx) => {
      const account = accounts.get(tx.accountId);
      const category = tx.categoryId ? categories.get(tx.categoryId) : undefined;
      return [
        tx.date,
        safeCell(account?.name ?? ''),
        safeCell(tx.payee),
        centsToPlain(tx.amountCents),
        account?.currency ?? '',
        labels.type(tx.type),
        labels.status(tx.status),
        safeCell(category ? labels.category(category) : ''),
        safeCell(tx.notes ?? ''),
      ];
    }),
  });
}
