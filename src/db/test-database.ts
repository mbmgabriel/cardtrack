/** Test-only: an in-memory SQLite with the real migrations applied. Never import from app code. */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';

import { createRepositories } from './repositories';
import * as schema from './schema';
import type { AppDatabase } from './types';

export function createTestDatabase() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') });
  return {
    db: db as AppDatabase,
    sqlite,
    repos: createRepositories(db),
    close: () => sqlite.close(),
  };
}
