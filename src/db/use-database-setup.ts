import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { useEffect, useState } from 'react';

import { todayISO } from '@/domain/dates';

import migrations from '../../drizzle/migrations';

import { db, repos } from './index';

type SetupState = { ready: boolean; error: Error | undefined };

/**
 * Runs pending migrations, seeds built-in data and brings recurring rules and statements up
 * to today.
 * `ready` is true once all are done.
 */
export function useDatabaseSetup(): SetupState {
  const [state, setState] = useState<SetupState>({ ready: false, error: undefined });

  useEffect(() => {
    let cancelled = false;
    migrate(db, migrations)
      .then(() => {
        repos.categories.seedDefaults();
        const today = todayISO();
        repos.recurring.processDue(today, repos.settings.get('recurring_auto_status'));
        repos.statements.sync(today);
        if (!cancelled) setState({ ready: true, error: undefined });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({ ready: false, error: e instanceof Error ? e : new Error(String(e)) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
