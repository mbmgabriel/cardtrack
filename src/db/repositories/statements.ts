import { and, desc, eq, inArray, isNotNull, lt } from 'drizzle-orm';

import { isISODate } from '@/domain/dates';
import { assertCents } from '@/domain/money';
import {
  amountPaidFor,
  isPaymentForPeriod,
  missingCycles,
  owedAsOf,
  summarizeStatement,
} from '@/domain/statements';
import { newId, nowTimestamp } from '@/utils/id';

import { accounts, statements, transactions, type NewStatement, type Statement } from '../schema';
import type { AppDatabase } from '../types';

export type StatementInput = Omit<NewStatement, 'id' | 'createdAt' | 'updatedAt'>;
export type StatementPatch = Partial<StatementInput>;

function validate(input: StatementPatch): void {
  for (const key of ['periodStart', 'periodEnd', 'dueDate'] as const) {
    const value = input[key];
    if (value !== undefined && !isISODate(value)) throw new RangeError(`${key} must be YYYY-MM-DD`);
  }
  for (const key of ['closingBalanceCents', 'minimumPaymentCents', 'amountPaidCents'] as const) {
    const value = input[key];
    if (value != null) assertCents(value, key);
  }
  if (input.periodStart && input.periodEnd && input.periodStart > input.periodEnd) {
    throw new RangeError('periodStart must be on or before periodEnd');
  }
}

export function createStatementsRepository(db: AppDatabase) {
  function getById(id: string): Statement | undefined {
    return db.select().from(statements).where(eq(statements.id, id)).get();
  }

  function listByAccountQuery(accountId: string) {
    return db
      .select()
      .from(statements)
      .where(eq(statements.accountId, accountId))
      .orderBy(desc(statements.periodEnd));
  }

  return {
    getById,
    listByAccountQuery,
    listByAccount: (accountId: string) => listByAccountQuery(accountId).all(),

    /** The statement for a given cycle, used to avoid creating the same cycle twice. */
    findByPeriodEnd(accountId: string, periodEnd: string): Statement | undefined {
      return db
        .select()
        .from(statements)
        .where(and(eq(statements.accountId, accountId), eq(statements.periodEnd, periodEnd)))
        .get();
    },

    /** The cycle before this one, for the reconcile starting balance. */
    previous(statement: Statement): Statement | undefined {
      return db
        .select()
        .from(statements)
        .where(
          and(
            eq(statements.accountId, statement.accountId),
            lt(statements.periodEnd, statement.periodEnd),
          ),
        )
        .orderBy(desc(statements.periodEnd))
        .get();
    },

    /**
     * Bring statements up to `today` for every active credit card / LOC with a statement day:
     * create missing cycles, link payments made between closing and the due date, and refresh each
     * statement's paid amount and status. Idempotent. Returns how many statements were created.
     */
    sync(today: string): number {
      let created = 0;
      const updatedAt = nowTimestamp();
      db.transaction((tx) => {
        const cards = tx
          .select()
          .from(accounts)
          .where(
            and(
              eq(accounts.isArchived, false),
              inArray(accounts.type, ['credit', 'line_of_credit']),
              isNotNull(accounts.statementDay),
            ),
          )
          .all();
        for (const account of cards) {
          const existing = tx
            .select({ periodEnd: statements.periodEnd })
            .from(statements)
            .where(eq(statements.accountId, account.id))
            .all();
          const cycles = missingCycles(
            { ...account, statementDay: account.statementDay! },
            new Set(existing.map((s) => s.periodEnd)),
            today,
          );
          for (const cycle of cycles) {
            tx.insert(statements)
              .values({
                id: newId(),
                accountId: account.id,
                periodStart: cycle.start,
                periodEnd: cycle.end,
                dueDate: cycle.dueDate,
              })
              .run();
            created++;
          }

          const rows = tx
            .select()
            .from(statements)
            .where(eq(statements.accountId, account.id))
            .all();
          const txs = tx
            .select()
            .from(transactions)
            .where(eq(transactions.accountId, account.id))
            .all();
          for (const statement of rows) {
            for (const payment of txs) {
              if (!isPaymentForPeriod(payment, statement)) continue;
              tx.update(transactions)
                .set({ statementId: statement.id, updatedAt })
                .where(eq(transactions.id, payment.id))
                .run();
              payment.statementId = statement.id;
            }
          }
          for (const statement of rows) {
            const amountPaidCents = amountPaidFor(statement.id, txs);
            const { status } = summarizeStatement(
              { ...statement, amountPaidCents },
              owedAsOf(account, txs, statement.periodEnd),
              today,
            );
            if (status !== statement.status || amountPaidCents !== statement.amountPaidCents) {
              tx.update(statements)
                .set({ status, amountPaidCents, updatedAt })
                .where(eq(statements.id, statement.id))
                .run();
            }
          }
        }
      });
      return created;
    },

    create(input: StatementInput): Statement {
      validate(input);
      const id = newId();
      db.insert(statements)
        .values({ ...input, id })
        .run();
      return getById(id)!;
    },

    update(id: string, patch: StatementPatch): Statement | undefined {
      validate(patch);
      db.update(statements)
        .set({ ...patch, updatedAt: nowTimestamp() })
        .where(eq(statements.id, id))
        .run();
      return getById(id);
    },

    /** Transactions in the cycle are kept; their statement_id becomes null. */
    delete(id: string): void {
      db.delete(statements).where(eq(statements.id, id)).run();
    },
  };
}

export type StatementsRepository = ReturnType<typeof createStatementsRepository>;
