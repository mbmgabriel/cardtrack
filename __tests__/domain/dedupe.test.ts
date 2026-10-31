import { computeDedupeHash, dedupeKey, normalizePayee, partitionDuplicates } from '@/domain/dedupe';

const base = {
  accountId: 'acc-1',
  date: '2026-10-01',
  amountCents: -450,
  payee: 'Tim Hortons #1234',
};

describe('normalizePayee', () => {
  it('ignores case, punctuation, accents and spacing', () => {
    expect(normalizePayee('  Tim Hortons #1234 ')).toBe('tim hortons 1234');
    expect(normalizePayee('TIM   HORTONS 1234')).toBe('tim hortons 1234');
    expect(normalizePayee('Café Dépanneur')).toBe('cafe depanneur');
    expect(normalizePayee('AMZN Mktp CA*2K4')).toBe('amzn mktp ca 2k4');
    expect(normalizePayee('***')).toBe('');
  });
});

describe('computeDedupeHash', () => {
  it('is deterministic and fixed-length hex', () => {
    const hash = computeDedupeHash(base);
    expect(hash).toMatch(/^[0-9a-f]{28}$/);
    expect(computeDedupeHash({ ...base })).toBe(hash);
  });

  it('matches payees that only differ in formatting', () => {
    expect(computeDedupeHash({ ...base, payee: 'TIM HORTONS 1234' })).toBe(computeDedupeHash(base));
  });

  it('differs when any identifying field differs', () => {
    const hash = computeDedupeHash(base);
    expect(computeDedupeHash({ ...base, accountId: 'acc-2' })).not.toBe(hash);
    expect(computeDedupeHash({ ...base, date: '2026-10-02' })).not.toBe(hash);
    expect(computeDedupeHash({ ...base, amountCents: 450 })).not.toBe(hash);
    expect(computeDedupeHash({ ...base, amountCents: -451 })).not.toBe(hash);
    expect(computeDedupeHash({ ...base, payee: 'Starbucks' })).not.toBe(hash);
  });

  it('keeps fields separated so they cannot run together', () => {
    expect(dedupeKey(base)).toBe('acc-1|2026-10-01|-450|tim hortons 1234');
  });

  it('has no collisions across many similar rows', () => {
    const hashes = new Set<string>();
    for (let amount = -5000; amount < 5000; amount++) {
      hashes.add(computeDedupeHash({ ...base, amountCents: amount }));
    }
    expect(hashes.size).toBe(10000);
  });
});

describe('partitionDuplicates', () => {
  const row = (hash: string, n: number) => ({ dedupeHash: hash, n });

  it('skips rows that already exist', () => {
    const { fresh, duplicates } = partitionDuplicates([row('a', 1), row('b', 2)], ['a']);
    expect(fresh).toEqual([row('b', 2)]);
    expect(duplicates).toEqual([row('a', 1)]);
  });

  it('importing the same file twice adds nothing the second time', () => {
    const file = [row('a', 1), row('b', 2), row('b', 3)];
    const first = partitionDuplicates(file, []);
    expect(first.fresh).toHaveLength(3);
    const second = partitionDuplicates(
      file,
      first.fresh.map((r) => r.dedupeHash),
    );
    expect(second.fresh).toHaveLength(0);
    expect(second.duplicates).toHaveLength(3);
  });

  it('keeps genuine repeats beyond what already exists (two coffees, one recorded)', () => {
    const { fresh, duplicates } = partitionDuplicates([row('a', 1), row('a', 2)], ['a']);
    expect(duplicates).toEqual([row('a', 1)]);
    expect(fresh).toEqual([row('a', 2)]);
  });

  it('handles empty inputs', () => {
    expect(partitionDuplicates([], ['a'])).toEqual({ fresh: [], duplicates: [] });
  });
});
