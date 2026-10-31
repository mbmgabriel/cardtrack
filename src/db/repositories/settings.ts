import { eq } from 'drizzle-orm';

import type { PayoffBaseline } from '@/domain/payoff';

import { settings } from '../schema';
import type { AppDatabase } from '../types';

/** Every setting with its default (PLAN.md §4). Keys match the stored keys. */
export const SETTINGS_DEFAULTS = {
  currency_default: 'CAD' as string,
  locale: 'en-CA' as 'en-CA' | 'fr-CA',
  app_lock_enabled: false as boolean,
  lock_timeout_seconds: 60 as number,
  theme: 'system' as 'system' | 'light' | 'dark',
  /** 0 = Sunday, 1 = Monday. */
  first_day_of_week: 0 as 0 | 1,
  onboarding_done: false as boolean,
  /** Status of transactions created by auto-create recurring rules (PLAN.md Phase 5). */
  recurring_auto_status: 'pending' as 'pending' | 'posted',
  /** Recurring suggestions the user dismissed (`suggestionKey` values). */
  recurring_dismissed: [] as string[],
  /** Local notifications (PLAN.md Phase 6). Off until the user turns them on and allows them. */
  reminders_enabled: false as boolean,
  reminder_due_days_before: 3 as number,
  reminder_recurring_enabled: true as boolean,
  reminder_hour: 9 as number,
  /** Dashboard privacy: show amounts as dots until the user reveals them. */
  hide_balances: false as boolean,
  /** CardTrack Pro (PLAN.md §8). Set by a purchase from Phase 11; a dev switch until then. */
  pro_unlocked: false as boolean,
  /** Debt payoff planner (Pro): strategy, extra paid each month, and minimums the user set. */
  payoff_strategy: 'avalanche' as 'avalanche' | 'snowball',
  payoff_extra_cents: 0 as number,
  payoff_minimums: {} as Record<string, number>,
  /** Plans the user chose to track, by currency, to compare real balances against. */
  payoff_baselines: {} as Record<string, PayoffBaseline>,
};

export type Settings = typeof SETTINGS_DEFAULTS;
export type SettingKey = keyof Settings;

function decode<K extends SettingKey>(key: K, raw: string | undefined): Settings[K] {
  if (raw === undefined) return SETTINGS_DEFAULTS[key];
  try {
    const value: unknown = JSON.parse(raw);
    // Ignore values whose type no longer matches (e.g. a corrupt or outdated entry).
    const fallback = SETTINGS_DEFAULTS[key];
    const sameShape = Array.isArray(fallback)
      ? Array.isArray(value)
      : typeof value === typeof fallback && !Array.isArray(value);
    return sameShape ? (value as Settings[K]) : fallback;
  } catch {
    return SETTINGS_DEFAULTS[key];
  }
}

export function createSettingsRepository(db: AppDatabase) {
  return {
    get<K extends SettingKey>(key: K): Settings[K] {
      const row = db.select().from(settings).where(eq(settings.key, key)).get();
      return decode(key, row?.value);
    },

    getAll(): Settings {
      const rows = new Map(
        db
          .select()
          .from(settings)
          .all()
          .map((r) => [r.key, r.value]),
      );
      const result = { ...SETTINGS_DEFAULTS };
      for (const key of Object.keys(SETTINGS_DEFAULTS) as SettingKey[]) {
        (result as Record<SettingKey, unknown>)[key] = decode(key, rows.get(key));
      }
      return result;
    },

    set<K extends SettingKey>(key: K, value: Settings[K]): void {
      const encoded = JSON.stringify(value);
      db.insert(settings)
        .values({ key, value: encoded })
        .onConflictDoUpdate({ target: settings.key, set: { value: encoded } })
        .run();
    },
  };
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>;
