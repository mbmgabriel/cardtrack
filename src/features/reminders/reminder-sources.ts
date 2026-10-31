import type { Account, RecurringRule, Statement, Transaction } from '@/db/schema';
import { addDaysISO } from '@/domain/dates';
import { nextOccurrences } from '@/domain/recurrence';
import { REMINDER_HORIZON_DAYS, type ChargeSource, type DueSource } from '@/domain/reminders';
import { isLiabilityAccount } from '@/domain/types';
import { statementListItem } from '@/features/statements/statement-view';

/** `remind_days_before` is at most 30, so look this much further ahead for charges. */
const MAX_REMIND_DAYS = 30;

/**
 * What reminders can be about: unpaid statements on active cards, and upcoming occurrences of
 * active recurring rules. Paid statements and archived accounts never remind.
 */
export function reminderSources(
  {
    accounts,
    statements,
    transactionsByAccount,
    rules,
  }: {
    accounts: readonly Account[];
    statements: readonly Statement[];
    transactionsByAccount: ReadonlyMap<string, readonly Transaction[]>;
    rules: readonly RecurringRule[];
  },
  today: string,
): { dues: DueSource[]; charges: ChargeSource[] } {
  const active = new Map(accounts.filter((a) => !a.isArchived).map((a) => [a.id, a] as const));

  const dues: DueSource[] = [];
  for (const statement of statements) {
    const account = active.get(statement.accountId);
    if (!account || !isLiabilityAccount(account.type) || statement.dueDate < today) continue;
    const { summary } = statementListItem(
      statement,
      account,
      transactionsByAccount.get(account.id) ?? [],
      today,
    );
    if (summary.status === 'paid') continue;
    dues.push({
      statementId: statement.id,
      accountName: account.name,
      currency: account.currency,
      dueDate: statement.dueDate,
      amountCents: summary.status === 'open' ? null : summary.remainingCents,
    });
  }

  const until = addDaysISO(today, REMINDER_HORIZON_DAYS + MAX_REMIND_DAYS);
  const charges = rules.flatMap((rule) => {
    const account = active.get(rule.accountId);
    if (!rule.isActive || !account) return [];
    return nextOccurrences(rule, today, until).map((date) => ({
      ruleId: rule.id,
      payee: rule.payee,
      accountName: account.name,
      currency: account.currency,
      amountCents: rule.amountCents,
      date,
      remindDaysBefore: rule.remindDaysBefore,
    }));
  });

  return { dues, charges };
}
