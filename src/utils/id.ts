import { randomUUID } from 'expo-crypto';

/** UUID v4 for primary keys (PLAN.md §3.5). */
export function newId(): string {
  return randomUUID();
}

export function nowTimestamp(): string {
  return new Date().toISOString();
}
