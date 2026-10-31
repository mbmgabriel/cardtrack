/** Field rules shared by forms (zod) and repositories (last line of defence). */
import { z } from 'zod';

/** Only the last 4 digits of a card are ever stored (PLAN.md §3.3). */
export const last4Schema = z.string().regex(/^\d{4}$/, 'last4');

export function isValidLast4(value: string): boolean {
  return last4Schema.safeParse(value).success;
}

export function assertValidLast4(value: string | null | undefined): void {
  if (value != null && !isValidLast4(value)) {
    throw new RangeError('last4 must be exactly 4 digits');
  }
}

export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color');

export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, 'currency');
