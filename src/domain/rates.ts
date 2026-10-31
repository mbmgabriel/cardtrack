/** Interest rates are stored as integer basis points: 19.99% = 1999 (PLAN.md §4). */
import { decimalSeparator, parseMoneyToCents } from './money';

export const MAX_RATE_BPS = 100_00;

/** Parse "19.99", "19,99 %" or "19.99%" to basis points. Null if invalid or outside 0–100%. */
export function parseRateToBps(input: string, locale = 'en-CA'): number | null {
  // A percentage with two decimals has the same shape as an amount with cents.
  const bps = parseMoneyToCents(input.replace('%', ''), locale);
  if (bps == null || bps < 0 || bps > MAX_RATE_BPS) return null;
  return bps;
}

/** 1999 → "19.99" (en-CA) / "19,99" (fr-CA), for inputs. */
export function bpsToInputString(bps: number, locale = 'en-CA'): string {
  const whole = Math.floor(bps / 100);
  const fraction = String(bps % 100).padStart(2, '0');
  return `${whole}${decimalSeparator(locale)}${fraction}`;
}

/** 1999 → "19.99%" (en-CA) / "19,99 %" (fr-CA), for display. */
export function formatBps(bps: number, locale = 'en-CA'): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(bps / 10000);
}
