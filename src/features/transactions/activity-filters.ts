import { addDays, endOfMonth, startOfMonth, startOfYear, subMonths } from 'date-fns';

import type { TransactionFilters } from '@/db/repositories/transactions';
import { parseISODate, toISODate } from '@/domain/dates';
import { parseSearchQuery } from '@/domain/transactions';
import {
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  type TransactionStatus,
  type TransactionType,
} from '@/domain/types';

export const DATE_PRESETS = [
  'all',
  'thisMonth',
  'lastMonth',
  'last90',
  'thisYear',
  'custom',
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export type ActivityFilterState = {
  text: string;
  accountIds: string[];
  categoryIds: string[];
  types: TransactionType[];
  statuses: TransactionStatus[];
  datePreset: DatePreset;
  /** Used when `datePreset` is 'custom'. */
  from: string;
  to: string;
};

export function emptyActivityFilters(today: string): ActivityFilterState {
  return {
    text: '',
    accountIds: [],
    categoryIds: [],
    types: [],
    statuses: [],
    datePreset: 'all',
    from: today,
    to: today,
  };
}

/** Inclusive date bounds for a preset, relative to `today`. */
export function presetRange(
  preset: Exclude<DatePreset, 'custom'>,
  today: string,
): { from?: string; to?: string } {
  const d = parseISODate(today);
  switch (preset) {
    case 'all':
      return {};
    case 'thisMonth':
      return { from: toISODate(startOfMonth(d)), to: toISODate(endOfMonth(d)) };
    case 'lastMonth': {
      const last = subMonths(startOfMonth(d), 1);
      return { from: toISODate(last), to: toISODate(endOfMonth(last)) };
    }
    case 'last90':
      return { from: toISODate(addDays(d, -89)), to: today };
    case 'thisYear':
      return { from: toISODate(startOfYear(d)), to: today };
  }
}

export function toTransactionFilters(
  state: ActivityFilterState,
  { locale, today, limit }: { locale: string; today: string; limit?: number },
): TransactionFilters {
  const range =
    state.datePreset === 'custom'
      ? // Accept the bounds in either order.
        state.from <= state.to
        ? { from: state.from, to: state.to }
        : { from: state.to, to: state.from }
      : presetRange(state.datePreset, today);
  return {
    query: parseSearchQuery(state.text, locale),
    accountIds: state.accountIds,
    categoryIds: state.categoryIds,
    types: state.types,
    statuses: state.statuses,
    ...range,
    limit,
  };
}

/** How many filter groups (not counting the search text) are narrowing the list. */
export function activeFilterCount(state: ActivityFilterState): number {
  return (
    [state.accountIds, state.categoryIds, state.types, state.statuses].filter((l) => l.length > 0)
      .length + (state.datePreset === 'all' ? 0 : 1)
  );
}

/**
 * Route params other screens use to open Activity pre-filtered (e.g. the dashboard's widgets).
 * Lists are comma-separated; `at` is a timestamp so the same link re-applies after the user changes
 * the filters by hand.
 */
export type ActivityParams = {
  text?: string;
  accountIds?: string;
  categoryIds?: string;
  statuses?: string;
  types?: string;
  preset?: string;
  at?: string;
};

function listParam<T extends string>(value: string | undefined, allowed: readonly T[]): T[] {
  if (!value) return [];
  return value.split(',').filter((v): v is T => (allowed as readonly string[]).includes(v));
}

/** Filters from route params, or null when the params ask for no filtering. */
export function filtersFromParams(
  params: ActivityParams,
  today: string,
): ActivityFilterState | null {
  const preset = (DATE_PRESETS as readonly string[]).includes(params.preset ?? '')
    ? (params.preset as DatePreset)
    : 'all';
  const state: ActivityFilterState = {
    ...emptyActivityFilters(today),
    text: params.text ?? '',
    accountIds: params.accountIds ? params.accountIds.split(',').filter(Boolean) : [],
    categoryIds: params.categoryIds ? params.categoryIds.split(',').filter(Boolean) : [],
    statuses: listParam(params.statuses, TRANSACTION_STATUSES),
    types: listParam(params.types, TRANSACTION_TYPES),
    datePreset: preset === 'custom' ? 'all' : preset,
  };
  return activeFilterCount(state) > 0 || state.text !== '' ? state : null;
}
