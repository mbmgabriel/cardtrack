/**
 * Money is always an integer number of cents (PLAN.md §3.1). Parsing works on the string's digits
 * so no floating-point value is ever used to compute a stored amount.
 */

export function isCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function assertCents(value: unknown, label = 'amount'): asserts value is number {
  if (!isCents(value)) {
    throw new TypeError(`${label} must be an integer number of cents, got ${String(value)}`);
  }
}

export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) {
    assertCents(value);
    total += value;
  }
  assertCents(total, 'total');
  return total;
}

/** The decimal separator a locale uses, e.g. "." for en-CA and "," for fr-CA. */
export function decimalSeparator(locale: string): string {
  // Hermes has no formatToParts, so read the separator out of a formatted "1.1" instead.
  const separator = new Intl.NumberFormat(locale).format(1.1).replace(/\d/g, '');
  return separator === ',' ? ',' : '.';
}

/**
 * Parse what a person typed (or a CSV cell) into cents. Returns null when it isn't a valid amount.
 *
 * Accepts currency symbols, grouping separators (",", ".", spaces, NBSP, apostrophes), a leading or
 * trailing minus, and accounting-style parentheses for negatives. At most two decimal places.
 * The locale decides the decimal separator; in a comma-decimal locale a lone "." followed by one or
 * two digits is also accepted as the decimal point (people often type "12.50" on any keyboard).
 */
export function parseMoneyToCents(input: string, locale = 'en-CA'): number | null {
  let s = input.trim();
  if (s === '') return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  // Currency symbols / codes and whitespace (incl. NBSP and narrow NBSP used by fr-CA grouping).
  s = s.replace(/[$€£¥]|CAD|USD|EUR|GBP/gi, '').replace(/[\s  ']/g, '');
  if (s.startsWith('-') || s.startsWith('−')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const decimal = decimalSeparator(locale);
  const group = decimal === ',' ? '.' : ',';
  let whole = s;
  let fraction = '';

  const lastDecimal = s.lastIndexOf(decimal);
  if (lastDecimal !== -1) {
    whole = s.slice(0, lastDecimal);
    fraction = s.slice(lastDecimal + 1);
  } else if (decimal === ',' && /^\d+\.\d{1,2}$/.test(s)) {
    [whole, fraction] = s.split('.');
  }

  if (whole.includes(decimal) || fraction.includes(group)) return null;
  if (fraction.length > 2) return null;
  if (whole.includes(group)) {
    // Grouping must be well-formed: 1,234,567 — not 12,34.
    if (!new RegExp(`^\\d{1,3}(\\${group}\\d{3})+$`).test(whole)) return null;
    whole = whole.split(group).join('');
  }
  if (whole === '' && fraction === '') return null;

  const cents = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return negative && cents !== 0 ? -cents : cents;
}

/** Format cents for display, e.g. 123456 → "$1,234.56" (en-CA) or "1 234,56 $" (fr-CA). */
export function formatCents(cents: number, currency = 'CAD', locale = 'en-CA'): string {
  assertCents(cents);
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

/**
 * A formatted amount split for display with quieter cents: "$2,490.39" → "$2,490" + ".39" + "",
 * "2 490,39 $" → "2 490" + ",39" + " $". Amounts without cents come back whole.
 */
export function splitFormattedCents(
  formatted: string,
  locale = 'en-CA',
): { whole: string; fraction: string; suffix: string } {
  const separator = decimalSeparator(locale);
  const at = formatted.lastIndexOf(separator);
  const match = at >= 0 ? /^(\d{2})(\D*)$/.exec(formatted.slice(at + 1)) : null;
  if (!match) return { whole: formatted, fraction: '', suffix: '' };
  return {
    whole: formatted.slice(0, at),
    fraction: `${separator}${match[1]}`,
    suffix: match[2],
  };
}

/** Plain editable string with no grouping or symbol, e.g. -123456 → "-1234.56". */
export function centsToInputString(cents: number, locale = 'en-CA'): string {
  assertCents(cents);
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');
  return `${cents < 0 ? '-' : ''}${whole}${decimalSeparator(locale)}${fraction}`;
}
