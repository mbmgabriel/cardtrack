import { repos } from '@/db';
import { useLiveData } from '@/db/live';
import type { Category } from '@/db/schema';

export function useCategories(): Category[] {
  return useLiveData(() => repos.categories.list(), ['categories']);
}

export function useCategoryMap(): Map<string, Category> {
  return useLiveData(() => new Map(repos.categories.list().map((c) => [c.id, c])), ['categories']);
}
