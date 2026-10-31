/**
 * Duplicate detection for imported transactions. The hash identifies "the same transaction" as
 * same account + date + amount + payee (ignoring case, accents, punctuation and spacing).
 */

export type DedupeKeyInput = {
  accountId: string;
  date: string;
  amountCents: number;
  payee: string;
};

/** "Tim Hortons #1234 " and "TIM HORTONS 1234" normalize to the same string. */
export function normalizePayee(payee: string): string {
  return payee
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** 53-bit string hash (cyrb53). Not cryptographic — only used to compare rows on one device. */
function cyrb53(str: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

export function dedupeKey({ accountId, date, amountCents, payee }: DedupeKeyInput): string {
  return [accountId, date, String(amountCents), normalizePayee(payee)].join('|');
}

/** Two independent 53-bit hashes (~106 bits) so accidental collisions are not a practical concern. */
export function computeDedupeHash(input: DedupeKeyInput): string {
  const key = dedupeKey(input);
  return cyrb53(key, 0) + cyrb53(key, 0x9e3779b9);
}

/**
 * Split incoming rows into new ones and duplicates of existing rows. Matching is per occurrence:
 * two identical coffees on the same day in a file are both kept unless two already exist.
 */
export function partitionDuplicates<T extends { dedupeHash: string }>(
  incoming: readonly T[],
  existingHashes: Iterable<string>,
): { fresh: T[]; duplicates: T[] } {
  const remaining = new Map<string, number>();
  for (const hash of existingHashes) {
    remaining.set(hash, (remaining.get(hash) ?? 0) + 1);
  }
  const fresh: T[] = [];
  const duplicates: T[] = [];
  for (const row of incoming) {
    const count = remaining.get(row.dedupeHash) ?? 0;
    if (count > 0) {
      remaining.set(row.dedupeHash, count - 1);
      duplicates.push(row);
    } else {
      fresh.push(row);
    }
  }
  return { fresh, duplicates };
}
