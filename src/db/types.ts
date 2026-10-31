import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type * as schema from './schema';

/**
 * Any synchronous Drizzle SQLite database with our schema: expo-sqlite in the app,
 * better-sqlite3 in tests. Repositories depend on this, never on a concrete driver.
 */
export type AppDatabase = BaseSQLiteDatabase<'sync', unknown, typeof schema>;
