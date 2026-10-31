/**
 * Calendar rules for statements and due dates (PLAN.md §7). All dates are ISO `YYYY-MM-DD`
 * strings in the user's local calendar; nothing here depends on time of day or time zone.
 */
import { addDays, addMonths, differenceInCalendarDays, format, getDaysInMonth } from 'date-fns';

/** Canadian cards must give at least a 21-day grace period. */
export const DEFAULT_DUE_DAY_OFFSET = 21;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= getDaysInMonth(new Date(y, m - 1, 1));
}

/** Parse `YYYY-MM-DD` as a local calendar date (never UTC, unlike `new Date('2026-02-15')`). */
export function parseISODate(value: string): Date {
  if (!isISODate(value)) throw new RangeError(`Invalid ISO date: ${value}`);
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

export function addDaysISO(date: string, days: number): string {
  return toISODate(addDays(parseISODate(date), days));
}

/** Calendar days from `from` to `to` (negative when `to` is in the past). */
export function daysBetween(from: string, to: string): number {
  return differenceInCalendarDays(parseISODate(to), parseISODate(from));
}

function assertStatementDay(statementDay: number): void {
  if (!Number.isInteger(statementDay) || statementDay < 1 || statementDay > 31) {
    throw new RangeError(`statementDay must be an integer 1–31, got ${statementDay}`);
  }
}

/** The statement closing date in a given month; day 31 in a 30-day month closes on the 30th. */
export function closingDateInMonth(year: number, monthIndex: number, statementDay: number): Date {
  assertStatementDay(statementDay);
  const firstOfMonth = new Date(year, monthIndex, 1);
  return new Date(year, monthIndex, Math.min(statementDay, getDaysInMonth(firstOfMonth)));
}

export type StatementPeriod = {
  /** First day of the cycle (the day after the previous closing date). */
  start: string;
  /** Closing date of the cycle (inclusive). */
  end: string;
};

/** The statement cycle containing `date`, e.g. day 15 → 16th of last month to 15th of this one. */
export function statementPeriodFor(date: string, statementDay: number): StatementPeriod {
  const d = parseISODate(date);
  let end = closingDateInMonth(d.getFullYear(), d.getMonth(), statementDay);
  if (d > end) {
    const next = addMonths(new Date(d.getFullYear(), d.getMonth(), 1), 1);
    end = closingDateInMonth(next.getFullYear(), next.getMonth(), statementDay);
  }
  const prevMonth = addMonths(new Date(end.getFullYear(), end.getMonth(), 1), -1);
  const previousEnd = closingDateInMonth(
    prevMonth.getFullYear(),
    prevMonth.getMonth(),
    statementDay,
  );
  return { start: toISODate(addDays(previousEnd, 1)), end: toISODate(end) };
}

/** The period immediately before the given one. */
export function previousStatementPeriod(
  period: StatementPeriod,
  statementDay: number,
): StatementPeriod {
  return statementPeriodFor(addDaysISO(period.start, -1), statementDay);
}

/** Payment due date for a statement closing on `periodEnd`. */
export function dueDateFor(periodEnd: string, dueDayOffset = DEFAULT_DUE_DAY_OFFSET): string {
  if (!Number.isInteger(dueDayOffset) || dueDayOffset < 0) {
    throw new RangeError(`dueDayOffset must be a non-negative integer, got ${dueDayOffset}`);
  }
  return addDaysISO(periodEnd, dueDayOffset);
}

export type UpcomingDue = {
  period: StatementPeriod;
  dueDate: string;
};

/**
 * The next payment due on or after `today`. A statement that has already closed but whose due
 * date hasn't passed comes first; otherwise it's the due date of the cycle in progress.
 */
export function nextDueDate(
  today: string,
  statementDay: number,
  dueDayOffset = DEFAULT_DUE_DAY_OFFSET,
): UpcomingDue {
  const current = statementPeriodFor(today, statementDay);
  // Two closed cycles back covers offsets longer than a month. Oldest first: earliest due wins.
  const previous = previousStatementPeriod(current, statementDay);
  const candidates = [previousStatementPeriod(previous, statementDay), previous];
  for (const period of candidates) {
    const dueDate = dueDateFor(period.end, dueDayOffset);
    if (dueDate >= today) return { period, dueDate };
  }
  // The cycle in progress always ends on or after today, so its due date is never in the past.
  return { period: current, dueDate: dueDateFor(current.end, dueDayOffset) };
}
