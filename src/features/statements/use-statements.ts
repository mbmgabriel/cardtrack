import { repos } from '@/db';
import { useLiveData } from '@/db/live';

import { buildStatementView, statementListItem } from './statement-view';

export function useAccountStatements(accountId: string, today: string) {
  return useLiveData(() => {
    const account = repos.accounts.getById(accountId);
    if (!account) return [];
    const transactions = repos.transactions.listByAccount(accountId);
    return repos.statements
      .listByAccount(accountId)
      .map((s) => statementListItem(s, account, transactions, today));
  }, ['accounts', 'transactions', 'statements']);
}

export function useStatement(id: string, today: string) {
  return useLiveData(() => {
    const statement = repos.statements.getById(id);
    const account = statement ? repos.accounts.getById(statement.accountId) : undefined;
    if (!statement || !account) return undefined;
    return {
      account,
      view: buildStatementView(
        statement,
        account,
        repos.transactions.listByAccount(account.id),
        repos.statements.previous(statement),
        today,
      ),
    };
  }, ['accounts', 'transactions', 'statements']);
}
