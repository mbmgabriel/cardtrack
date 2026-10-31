import {
  addDaysISO,
  closingDateInMonth,
  DEFAULT_DUE_DAY_OFFSET,
  daysBetween,
  dueDateFor,
  isISODate,
  nextDueDate,
  parseISODate,
  previousStatementPeriod,
  statementPeriodFor,
  toISODate,
  todayISO,
} from '@/domain/dates';

describe('ISO date helpers', () => {
  it('validates real calendar dates', () => {
    expect(isISODate('2026-02-28')).toBe(true);
    expect(isISODate('2028-02-29')).toBe(true); // leap year
    expect(isISODate('2026-02-29')).toBe(false);
    expect(isISODate('2026-04-31')).toBe(false);
    expect(isISODate('2026-13-01')).toBe(false);
    expect(isISODate('2026-00-10')).toBe(false);
    expect(isISODate('2026-1-5')).toBe(false);
    expect(isISODate('not a date')).toBe(false);
  });

  it('parses as a local date, not UTC', () => {
    const d = parseISODate('2026-03-01');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 2, 1]);
    expect(toISODate(d)).toBe('2026-03-01');
  });

  it('throws on invalid input', () => {
    expect(() => parseISODate('2026-02-30')).toThrow(RangeError);
  });

  it('todayISO uses the given clock', () => {
    expect(todayISO(new Date(2026, 9, 29, 23, 59))).toBe('2026-10-29');
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('adds days across month, year and DST boundaries', () => {
    expect(addDaysISO('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysISO('2026-03-07', 2)).toBe('2026-03-09'); // DST starts Mar 8 in Canada
    expect(addDaysISO('2026-11-01', -1)).toBe('2026-10-31'); // DST ends Nov 1
    expect(addDaysISO('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('counts calendar days', () => {
    expect(daysBetween('2026-10-29', '2026-11-05')).toBe(7);
    expect(daysBetween('2026-11-05', '2026-10-29')).toBe(-7);
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
  });
});

describe('closingDateInMonth', () => {
  it('clamps day 31 to short months', () => {
    expect(toISODate(closingDateInMonth(2026, 1, 31))).toBe('2026-02-28');
    expect(toISODate(closingDateInMonth(2028, 1, 31))).toBe('2028-02-29');
    expect(toISODate(closingDateInMonth(2026, 3, 31))).toBe('2026-04-30');
    expect(toISODate(closingDateInMonth(2026, 0, 31))).toBe('2026-01-31');
  });

  it('rejects invalid statement days', () => {
    expect(() => closingDateInMonth(2026, 0, 0)).toThrow(RangeError);
    expect(() => closingDateInMonth(2026, 0, 32)).toThrow(RangeError);
    expect(() => closingDateInMonth(2026, 0, 1.5)).toThrow(RangeError);
  });
});

describe('statementPeriodFor', () => {
  it('statement day 15: 16th of last month to 15th of this month', () => {
    expect(statementPeriodFor('2026-10-10', 15)).toEqual({
      start: '2026-09-16',
      end: '2026-10-15',
    });
    expect(statementPeriodFor('2026-10-15', 15)).toEqual({
      start: '2026-09-16',
      end: '2026-10-15',
    });
    expect(statementPeriodFor('2026-10-16', 15)).toEqual({
      start: '2026-10-16',
      end: '2026-11-15',
    });
  });

  it('wraps across the year end', () => {
    expect(statementPeriodFor('2026-12-20', 15)).toEqual({
      start: '2026-12-16',
      end: '2027-01-15',
    });
    expect(statementPeriodFor('2027-01-03', 15)).toEqual({
      start: '2026-12-16',
      end: '2027-01-15',
    });
  });

  it('statement day 31 uses the last day of short months', () => {
    expect(statementPeriodFor('2026-02-10', 31)).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    });
    expect(statementPeriodFor('2026-03-10', 31)).toEqual({
      start: '2026-03-01',
      end: '2026-03-31',
    });
    expect(statementPeriodFor('2026-04-30', 31)).toEqual({
      start: '2026-04-01',
      end: '2026-04-30',
    });
    expect(statementPeriodFor('2028-02-29', 31)).toEqual({
      start: '2028-02-01',
      end: '2028-02-29',
    });
  });

  it('statement day 30/29 around February leaves no gaps', () => {
    expect(statementPeriodFor('2026-01-31', 30)).toEqual({
      start: '2026-01-31',
      end: '2026-02-28',
    });
    expect(statementPeriodFor('2026-03-01', 30)).toEqual({
      start: '2026-03-01',
      end: '2026-03-30',
    });
    expect(statementPeriodFor('2026-03-01', 29)).toEqual({
      start: '2026-03-01',
      end: '2026-03-29',
    });
  });

  it('statement day 1', () => {
    expect(statementPeriodFor('2026-10-01', 1)).toEqual({ start: '2026-09-02', end: '2026-10-01' });
    expect(statementPeriodFor('2026-10-02', 1)).toEqual({ start: '2026-10-02', end: '2026-11-01' });
  });

  it('consecutive periods are contiguous for every statement day over two years', () => {
    for (let day = 1; day <= 31; day++) {
      let period = statementPeriodFor('2026-01-01', day);
      for (let i = 0; i < 24; i++) {
        const next = statementPeriodFor(addDaysISO(period.end, 1), day);
        expect(next.start).toBe(addDaysISO(period.end, 1));
        expect(previousStatementPeriod(next, day)).toEqual(period);
        period = next;
      }
    }
  });
});

describe('dueDateFor', () => {
  it('defaults to the 21-day grace period', () => {
    expect(DEFAULT_DUE_DAY_OFFSET).toBe(21);
    expect(dueDateFor('2026-10-15')).toBe('2026-11-05');
    expect(dueDateFor('2026-02-28', 21)).toBe('2026-03-21');
    expect(dueDateFor('2026-12-15', 25)).toBe('2027-01-09');
    expect(dueDateFor('2026-10-15', 0)).toBe('2026-10-15');
  });

  it('rejects negative or fractional offsets', () => {
    expect(() => dueDateFor('2026-10-15', -1)).toThrow(RangeError);
    expect(() => dueDateFor('2026-10-15', 1.5)).toThrow(RangeError);
  });
});

describe('nextDueDate (statement day 15, offset 21)', () => {
  it('before the previous statement is due: that statement', () => {
    // Sep 15 statement is due Oct 6.
    expect(nextDueDate('2026-10-01', 15, 21)).toEqual({
      period: { start: '2026-08-16', end: '2026-09-15' },
      dueDate: '2026-10-06',
    });
  });

  it('on the due date itself: still that statement', () => {
    expect(nextDueDate('2026-10-06', 15, 21).dueDate).toBe('2026-10-06');
  });

  it('after the previous due date: the current cycle', () => {
    expect(nextDueDate('2026-10-07', 15, 21)).toEqual({
      period: { start: '2026-09-16', end: '2026-10-15' },
      dueDate: '2026-11-05',
    });
  });

  it('on the closing day: the cycle closing today', () => {
    expect(nextDueDate('2026-10-15', 15, 21).dueDate).toBe('2026-11-05');
  });

  it('uses the default offset', () => {
    expect(nextDueDate('2026-10-29', 15).dueDate).toBe('2026-11-05');
  });

  it('handles offsets longer than a cycle', () => {
    // Aug 15 statement + 50 days = Oct 4; Sep 15 + 50 = Nov 4.
    expect(nextDueDate('2026-10-01', 15, 50).dueDate).toBe('2026-10-04');
    expect(nextDueDate('2026-10-05', 15, 50).dueDate).toBe('2026-11-04');
  });

  it('statement day 31 in February', () => {
    // Jan 31 statement due Feb 21; then Feb 28 statement due Mar 21.
    expect(nextDueDate('2026-02-10', 31, 21).dueDate).toBe('2026-02-21');
    expect(nextDueDate('2026-02-22', 31, 21)).toEqual({
      period: { start: '2026-02-01', end: '2026-02-28' },
      dueDate: '2026-03-21',
    });
  });
});
