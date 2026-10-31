/** App entry point to the database. Screens use `repos`, never raw SQL (PLAN.md §3.6). */
import { createBackupService } from './backup';
import { db } from './client';
import { createRepositories } from './repositories';

export { db };
export const repos = createRepositories(db);
export const backups = createBackupService(db);
