import type { AppDatabase } from '../types';

import { createAccountsRepository } from './accounts';
import { createCategoriesRepository } from './categories';
import { createCsvMappingsRepository } from './csv-mappings';
import { createImportsRepository } from './imports';
import { createInstallmentsRepository } from './installments';
import { createRecurringRepository } from './recurring';
import { createSettingsRepository } from './settings';
import { createStatementsRepository } from './statements';
import { createTransactionsRepository } from './transactions';

export function createRepositories(db: AppDatabase) {
  return {
    accounts: createAccountsRepository(db),
    transactions: createTransactionsRepository(db),
    categories: createCategoriesRepository(db),
    recurring: createRecurringRepository(db),
    installments: createInstallmentsRepository(db),
    statements: createStatementsRepository(db),
    settings: createSettingsRepository(db),
    imports: createImportsRepository(db),
    csvMappings: createCsvMappingsRepository(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
