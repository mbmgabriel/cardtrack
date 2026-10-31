import { useEffect } from 'react';
import { AppState } from 'react-native';

import { repos } from '@/db';
import { todayISO } from '@/domain/dates';

/**
 * Bring date-driven data up to today: auto-create due recurring transactions, then create
 * statement cycles and link payments. Both steps are idempotent, so this can run any time.
 */
export function runDailyJobs(today = todayISO()): void {
  repos.recurring.processDue(today, repos.settings.get('recurring_auto_status'));
  repos.statements.sync(today);
}

/** Run the daily jobs whenever the app comes back to the foreground (the date may have changed). */
export function useDailyJobsOnForeground(): void {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') runDailyJobs();
    });
    return () => subscription.remove();
  }, []);
}
