import { repos } from '@/db';
import { useLiveData } from '@/db/live';
import type { RecurringRule } from '@/db/schema';

export function useAccountRules(accountId: string): RecurringRule[] {
  return useLiveData(() => repos.recurring.listByAccount(accountId), ['recurring_rules']);
}

export function useRule(id: string): RecurringRule | undefined {
  return useLiveData(() => repos.recurring.getById(id), ['recurring_rules']);
}

export function useDismissedSuggestions(): string[] {
  return useLiveData(() => repos.settings.get('recurring_dismissed'), ['settings']);
}
