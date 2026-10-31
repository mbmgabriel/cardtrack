import { and, asc, eq, lte } from 'drizzle-orm';

import { isISODate } from '@/domain/dates';
import { computeDedupeHash } from '@/domain/dedupe';
import { assertCents } from '@/domain/money';
import { planRecurringRun, recurringTransactionType } from '@/domain/recurrence';
import { newId, nowTimestamp } from '@/utils/id';

import {
  accounts,
  recurringRules,
  transactions,
  type NewRecurringRule,
  type RecurringRule,
} from '../schema';
import type { AppDatabase } from '../types';

export type RecurringRuleInput = Omit<NewRecurringRule, 'id' | 'createdAt' | 'updatedAt'>;
export type RecurringRulePatch = Partial<RecurringRuleInput>;

function validate(input: RecurringRulePatch): void {
  if (input.amountCents !== undefined) assertCents(input.amountCents, 'amountCents');
  for (const key of ['anchorDate', 'nextDate', 'endDate'] as const) {
    const value = input[key];
    if (value != null && !isISODate(value)) throw new RangeError(`${key} must be YYYY-MM-DD`);
  }
  if (input.interval !== undefined && (!Number.isInteger(input.interval) || input.interval < 1)) {
    throw new RangeError('interval must be a positive integer');
  }
}

export function createRecurringRepository(db: AppDatabase) {
  function getById(id: string): RecurringRule | undefined {
    return db.select().from(recurringRules).where(eq(recurringRules.id, id)).get();
  }

  function listByAccountQuery(accountId: string) {
    return db
      .select()
      .from(recurringRules)
      .where(eq(recurringRules.accountId, accountId))
      .orderBy(asc(recurringRules.nextDate));
  }

  function listActiveQuery() {
    return db
      .select()
      .from(recurringRules)
      .where(eq(recurringRules.isActive, true))
      .orderBy(asc(recurringRules.nextDate));
  }

  return {
    getById,
    listByAccountQuery,
    listByAccount: (accountId: string) => listByAccountQuery(accountId).all(),
    listActiveQuery,
    listActive: () => listActiveQuery().all(),

    /** Active rules whose next occurrence is on or before `date`. */
    listDueOnOrBefore(date: string): RecurringRule[] {
      return db
        .select()
        .from(recurringRules)
        .where(and(eq(recurringRules.isActive, true), lte(recurringRules.nextDate, date)))
        .orderBy(asc(recurringRules.nextDate))
        .all();
    },

    /**
     * Bring every active rule up to `today` (see `planRecurringRun`): auto-create rules add their
     * due transactions, all rules move their next date forward, and rules past their end date are
     * deactivated. Safe to call any number of times. Returns how many transactions were created.
     */
    processDue(today: string, status: 'pending' | 'posted'): number {
      let created = 0;
      const updatedAt = nowTimestamp();
      db.transaction((tx) => {
        const rows = tx
          .select({ rule: recurringRules, accountType: accounts.type })
          .from(recurringRules)
          .innerJoin(accounts, eq(accounts.id, recurringRules.accountId))
          .where(and(eq(recurringRules.isActive, true), eq(accounts.isArchived, false)))
          .all();
        for (const { rule, accountType } of rows) {
          const plan = planRecurringRun(rule, today);
          for (const date of plan.create) {
            // Belt and braces: never two transactions from one rule on the same date.
            const existing = tx
              .select({ id: transactions.id })
              .from(transactions)
              .where(and(eq(transactions.recurringId, rule.id), eq(transactions.date, date)))
              .get();
            if (existing) continue;
            const key = {
              accountId: rule.accountId,
              date,
              payee: rule.payee,
              amountCents: rule.amountCents,
            };
            tx.insert(transactions)
              .values({
                ...key,
                id: newId(),
                type: recurringTransactionType(accountType, rule.amountCents),
                status,
                categoryId: rule.categoryId,
                recurringId: rule.id,
                dedupeHash: computeDedupeHash(key),
              })
              .run();
            created++;
          }
          if (plan.nextDate !== rule.nextDate) {
            tx.update(recurringRules)
              .set(
                plan.nextDate == null
                  ? { isActive: false, updatedAt }
                  : { nextDate: plan.nextDate, updatedAt },
              )
              .where(eq(recurringRules.id, rule.id))
              .run();
          }
        }
      });
      return created;
    },

    create(input: RecurringRuleInput): RecurringRule {
      validate(input);
      const id = newId();
      db.insert(recurringRules)
        .values({ ...input, id })
        .run();
      return getById(id)!;
    },

    update(id: string, patch: RecurringRulePatch): RecurringRule | undefined {
      validate(patch);
      db.update(recurringRules)
        .set({ ...patch, updatedAt: nowTimestamp() })
        .where(eq(recurringRules.id, id))
        .run();
      return getById(id);
    },

    /** Transactions created from the rule keep existing; their recurring_id becomes null. */
    delete(id: string): void {
      db.delete(recurringRules).where(eq(recurringRules.id, id)).run();
    },
  };
}

export type RecurringRepository = ReturnType<typeof createRecurringRepository>;
