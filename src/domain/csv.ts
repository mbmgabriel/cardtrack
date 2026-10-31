/**
 * CSV import (PLAN.md Phase 7): split a bank export into rows, apply a column mapping, and turn
 * each row into a dated, signed amount. Rows that can't be read (preamble lines, totals, blank
 * cells) are reported, never guessed.
 */
import Papa from 'papaparse';

import { isISODate } from './dates';
import { normalizePayee } from './dedupe';
import { parseMoneyToCents } from './money';
import { isLiabilityAccount, type AccountType, type TransactionType } from './types';

export const DATE_FORMATS = [
  'YYYY-MM-DD',
  'MM/DD/YYYY',
  'DD/MM/YYYY',
  'YYYYMMDD',
  'D MMM YYYY',
] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export type ColumnMapping = {
  hasHeader: boolean;
  dateCol: number;
  dateFormat: DateFormat;
  payeeCol: number;
  /** Single signed amount column… */
  amountCol: number | null;
  /** …or separate money-out / money-in columns (both positive in the file). */
  debitCol: number | null;
  creditCol: number | null;
  /** Flip every amount (many credit card exports show charges as positive). */
  invertSign: boolean;
};

/** Split CSV text into rows of trimmed cells; tolerates a BOM, CRLF and blank lines. */
export function parseCsvRows(text: string): string[][] {
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
  return result.data.map((row) => row.map((cell) => (cell ?? '').trim()));
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// French abbreviations used by Canadian banks (accents removed before matching).
const MONTHS_FR = [
  'janv',
  'fevr',
  'mars',
  'avr',
  'mai',
  'juin',
  'juil',
  'aout',
  'sept',
  'oct',
  'nov',
  'dec',
];

function iso(y: number, m: number, d: number): string | null {
  const value = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isISODate(value) ? value : null;
}

function monthFromName(name: string): number | null {
  const n = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.$/, '');
  const en = MONTHS.findIndex((m) => n.startsWith(m));
  if (en !== -1) return en + 1;
  const fr = MONTHS_FR.findIndex((m) => n.startsWith(m) || m.startsWith(n));
  return fr === -1 ? null : fr + 1;
}

/** Parse a date cell in the given format into `YYYY-MM-DD`, or null. Day/month may be 1 or 2 digits. */
export function parseCsvDate(value: string, format: DateFormat): string | null {
  const v = value.trim();
  let m: RegExpExecArray | null;
  switch (format) {
    case 'YYYY-MM-DD':
      m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(v);
      return m ? iso(+m[1], +m[2], +m[3]) : null;
    case 'MM/DD/YYYY':
      m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(v);
      return m ? iso(+m[3], +m[1], +m[2]) : null;
    case 'DD/MM/YYYY':
      m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(v);
      return m ? iso(+m[3], +m[2], +m[1]) : null;
    case 'YYYYMMDD':
      m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
      return m ? iso(+m[1], +m[2], +m[3]) : null;
    case 'D MMM YYYY': {
      // "05 Oct 2026", "5-Oct-2026", "Oct 5, 2026", "5 oct. 2026"
      m = /^(\d{1,2})[\s-]+([A-Za-zÀ-ÿ.]+)[\s-]+(\d{4})$/.exec(v);
      if (m) {
        const month = monthFromName(m[2]);
        return month ? iso(+m[3], month, +m[1]) : null;
      }
      m = /^([A-Za-zÀ-ÿ.]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(v);
      if (!m) return null;
      const month = monthFromName(m[1]);
      return month ? iso(+m[3], month, +m[2]) : null;
    }
  }
}

/**
 * The date format that reads every sample, preferring unambiguous ones. With only days ≤ 12,
 * month-first (the usual Canadian bank export) wins over day-first.
 */
export function detectDateFormat(samples: readonly string[]): DateFormat | null {
  const values = samples.map((s) => s.trim()).filter(Boolean);
  if (values.length === 0) return null;
  return DATE_FORMATS.find((f) => values.every((v) => parseCsvDate(v, f) != null)) ?? null;
}

/** Bank files use "." decimals, but some French exports use ","; accept either. */
export function parseCsvAmount(value: string): number | null {
  const v = value.trim();
  if (v === '') return null;
  return parseMoneyToCents(v, 'en-CA') ?? parseMoneyToCents(v, 'fr-CA');
}

export type ParsedRow = {
  /** 1-based line in the file, for messages. */
  line: number;
  date: string;
  payee: string;
  amountCents: number;
};

export type RowProblem = { line: number; reason: 'date' | 'amount' | 'payee' };

export type MappingResult = { rows: ParsedRow[]; problems: RowProblem[] };

function cell(row: readonly string[], col: number | null): string {
  return col == null ? '' : (row[col] ?? '').trim();
}

export function applyMapping(rows: readonly string[][], mapping: ColumnMapping): MappingResult {
  const parsed: ParsedRow[] = [];
  const problems: RowProblem[] = [];
  rows.forEach((row, index) => {
    if (mapping.hasHeader && index === 0) return;
    const line = index + 1;
    const date = parseCsvDate(cell(row, mapping.dateCol), mapping.dateFormat);
    if (!date) return problems.push({ line, reason: 'date' });

    let amount: number | null;
    if (mapping.amountCol != null) {
      amount = parseCsvAmount(cell(row, mapping.amountCol));
    } else {
      const debit = parseCsvAmount(cell(row, mapping.debitCol));
      const credit = parseCsvAmount(cell(row, mapping.creditCol));
      amount =
        debit == null && credit == null
          ? null
          : (credit == null ? 0 : Math.abs(credit)) - (debit == null ? 0 : Math.abs(debit));
    }
    if (amount == null) return problems.push({ line, reason: 'amount' });
    if (mapping.invertSign) amount = -amount;

    const payee = cell(row, mapping.payeeCol).replace(/\s+/g, ' ');
    if (payee === '') return problems.push({ line, reason: 'payee' });
    parsed.push({ line, date, payee, amountCents: amount === 0 ? 0 : amount });
  });
  return { rows: parsed, problems };
}

/** How many columns the file has (the widest row). */
export function columnCount(rows: readonly string[][]): number {
  return rows.reduce((max, row) => Math.max(max, row.length), 0);
}

/**
 * Type for an imported row: money out is a purchase; money into a card is a payment when it looks
 * like one ("PAYMENT", "PAIEMENT", "THANK YOU") and a refund otherwise; money into anything else is
 * a deposit.
 */
export function importedTransactionType(
  accountType: AccountType,
  amountCents: number,
  payee: string,
): TransactionType {
  if (amountCents < 0) return 'purchase';
  if (!isLiabilityAccount(accountType)) return 'deposit';
  return /payment|paiement|thank you|merci/i.test(payee) ? 'payment' : 'refund';
}

/**
 * Key for remembering a payee's category across spellings: "TIM HORTONS #1234" and "Tim Hortons"
 * share one. Store numbers and other all-digit words are dropped.
 */
export function payeeCategoryKey(payee: string): string {
  return normalizePayee(payee)
    .split(' ')
    .filter((word) => !/^\d+$/.test(word))
    .join(' ');
}
