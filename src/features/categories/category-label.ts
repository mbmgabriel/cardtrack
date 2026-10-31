import type { TFunction } from 'i18next';

import { DEFAULT_CATEGORIES } from '@/db/repositories/categories';
import type { Category } from '@/db/schema';

const DEFAULT_NAMES = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c.name]));

/** Built-in categories are translated until the user renames them; custom ones show their name. */
export function categoryLabel(category: Pick<Category, 'id' | 'name'>, t: TFunction): string {
  return DEFAULT_NAMES.get(category.id) === category.name
    ? t(`categories.${category.id}`, { defaultValue: category.name })
    : category.name;
}
