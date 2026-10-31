import {
  activeFilterCount,
  emptyActivityFilters,
  filtersFromParams,
  presetRange,
  toTransactionFilters,
} from '@/features/transactions/activity-filters';

const today = '2026-03-15';

describe('presetRange', () => {
  it.each([
    ['all', {}],
    ['thisMonth', { from: '2026-03-01', to: '2026-03-31' }],
    ['lastMonth', { from: '2026-02-01', to: '2026-02-28' }],
    ['last90', { from: '2025-12-16', to: '2026-03-15' }],
    ['thisYear', { from: '2026-01-01', to: '2026-03-15' }],
  ] as const)('%s', (preset, expected) => {
    expect(presetRange(preset, today)).toEqual(expected);
  });

  it('last month crosses the year boundary', () => {
    expect(presetRange('lastMonth', '2026-01-10')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });
});

describe('toTransactionFilters', () => {
  const ctx = { locale: 'en-CA', today };

  it('passes lists through and parses the search text', () => {
    const state = {
      ...emptyActivityFilters(today),
      text: '54.20',
      accountIds: ['a'],
      statuses: ['pending' as const],
    };
    expect(toTransactionFilters(state, { ...ctx, limit: 10 })).toEqual({
      query: { text: '54.20', amountCents: 5420 },
      accountIds: ['a'],
      categoryIds: [],
      types: [],
      statuses: ['pending'],
      limit: 10,
    });
  });

  it('uses the preset range', () => {
    const state = { ...emptyActivityFilters(today), datePreset: 'thisMonth' as const };
    expect(toTransactionFilters(state, ctx)).toMatchObject({
      from: '2026-03-01',
      to: '2026-03-31',
    });
  });

  it('uses custom dates in either order', () => {
    const state = {
      ...emptyActivityFilters(today),
      datePreset: 'custom' as const,
      from: '2026-03-10',
      to: '2026-03-01',
    };
    expect(toTransactionFilters(state, ctx)).toMatchObject({
      from: '2026-03-01',
      to: '2026-03-10',
    });
  });
});

describe('activeFilterCount', () => {
  it('counts each narrowed group once', () => {
    const empty = emptyActivityFilters(today);
    expect(activeFilterCount({ ...empty, text: 'x' })).toBe(0);
    expect(
      activeFilterCount({ ...empty, accountIds: ['a', 'b'], types: ['fee'], datePreset: 'last90' }),
    ).toBe(3);
  });
});

describe('filtersFromParams', () => {
  it('reads lists and the date preset', () => {
    expect(
      filtersFromParams(
        { statuses: 'pending', types: 'purchase,refund', preset: 'thisMonth', accountIds: 'a,b' },
        today,
      ),
    ).toEqual({
      ...emptyActivityFilters(today),
      statuses: ['pending'],
      types: ['purchase', 'refund'],
      datePreset: 'thisMonth',
      accountIds: ['a', 'b'],
    });
  });

  it('drops unknown values and returns null when nothing is left', () => {
    expect(
      filtersFromParams({ statuses: 'bogus', types: 'nope', preset: 'custom' }, today),
    ).toBeNull();
    expect(filtersFromParams({ at: '123' }, today)).toBeNull();
    expect(filtersFromParams({ statuses: 'void,bogus' }, today)?.statuses).toEqual(['void']);
  });
});

describe('filtersFromParams from reports', () => {
  it('reads search text and categories', () => {
    expect(filtersFromParams({ text: 'Loblaws' }, today)?.text).toBe('Loblaws');
    expect(filtersFromParams({ categoryIds: 'sys-dining' }, today)?.categoryIds).toEqual([
      'sys-dining',
    ]);
  });
});
