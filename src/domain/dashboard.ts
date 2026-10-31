/**
 * Dashboard rules (PLAN.md §5, §7): what counts as spending, month-over-month ranges, and how
 * urgent an upcoming due date is.
 */
import { endOfMonth, startOfMonth, subMonths } from 'date-fns';

import { addDaysISO, daysBetween, parseISODate, toISODate } from './dates';
import type { TransactionStatus, TransactionType } from './types';

/**
 * Types that count as spending. Refunds reduce it; payments, deposits, transfers and adjustments
 * move money around without being spending (§7).
 */
export const SPENDING_TYPES = [
  'purchase',
  'refund',
  'fee',
  'interest',
] as const satisfies readonly TransactionType[];

export type SpendingCandidate = {
  type: TransactionType;
  status: TransactionStatus;
  transferGroupId: string | null;
};

export function isSpending(tx: SpendingCandidate): boolean {
  return (
    tx.status !== 'void' &&
    tx.transferGroupId == null &&
    (SPENDING_TYPES as readonly TransactionType[]).includes(tx.type)
  );
}

export type DateRange = { from: string; to: string };

export type MonthRanges = {
  /** First of this month through today. */
  thisMonth: DateRange;
  /** The same days of last month, for a fair comparison (Mar 1–15 vs Feb 1–15). */
  lastMonthToDate: DateRange;
  /** All of last month. */
  lastMonth: DateRange;
};

export function monthRanges(today: string): MonthRanges {
  const d = parseISODate(today);
  const lastStart = subMonths(startOfMonth(d), 1);
  const lastEnd = endOfMonth(lastStart);
  const sameDay = new Date(
    lastStart.getFullYear(),
    lastStart.getMonth(),
    Math.min(d.getDate(), lastEnd.getDate()),
  );
  return {
    thisMonth: { from: toISODate(startOfMonth(d)), to: today },
    lastMonthToDate: { from: toISODate(lastStart), to: toISODate(sameDay) },
    lastMonth: { from: toISODate(lastStart), to: toISODate(lastEnd) },
  };
}

/** Relative change (0.25 = up 25%). Null when there is nothing to compare against. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

export type DueUrgency = 'overdue' | 'urgent' | 'soon' | 'later';

/** Due within 3 days is urgent, within a week is soon. */
export function dueUrgency(daysUntil: number): DueUrgency {
  if (daysUntil < 0) return 'overdue';
  if (daysUntil <= 3) return 'urgent';
  if (daysUntil <= 7) return 'soon';
  return 'later';
}

/** Whether `date` is between `today` and `days` days from now, inclusive. */
export function isWithinDays(date: string, today: string, days: number): boolean {
  return date >= today && date <= addDaysISO(today, days);
}

export function daysUntil(date: string, today: string): number {
  return daysBetween(today, date);
}
