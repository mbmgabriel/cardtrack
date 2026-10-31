import { asc, eq } from 'drizzle-orm';

import { isISODate } from '@/domain/dates';
import { assertCents } from '@/domain/money';
import { newId, nowTimestamp } from '@/utils/id';

import { installmentPlans, type InstallmentPlan, type NewInstallmentPlan } from '../schema';
import type { AppDatabase } from '../types';

export type InstallmentInput = Omit<NewInstallmentPlan, 'id' | 'createdAt' | 'updatedAt'>;
export type InstallmentPatch = Partial<InstallmentInput>;

/** Longest plan accepted: 10 years of monthly instalments. */
export const MAX_INSTALLMENT_MONTHS = 120;

function validate(input: InstallmentPatch): void {
  for (const key of ['principalCents', 'monthlyCents', 'monthlyFeeCents'] as const) {
    if (input[key] !== undefined) assertCents(input[key], key);
  }
  if (
    input.months !== undefined &&
    (!Number.isInteger(input.months) || input.months < 1 || input.months > MAX_INSTALLMENT_MONTHS)
  ) {
    throw new RangeError(`months must be 1–${MAX_INSTALLMENT_MONTHS}`);
  }
  if (input.firstPaymentDate !== undefined && !isISODate(input.firstPaymentDate)) {
    throw new RangeError('firstPaymentDate must be YYYY-MM-DD');
  }
}

export function createInstallmentsRepository(db: AppDatabase) {
  const getById = (id: string): InstallmentPlan | undefined =>
    db.select().from(installmentPlans).where(eq(installmentPlans.id, id)).get();

  return {
    getById,

    /** Every plan, oldest first (finished ones too; callers decide what to show). */
    list: (): InstallmentPlan[] =>
      db.select().from(installmentPlans).orderBy(asc(installmentPlans.firstPaymentDate)).all(),

    listByAccount: (accountId: string): InstallmentPlan[] =>
      db
        .select()
        .from(installmentPlans)
        .where(eq(installmentPlans.accountId, accountId))
        .orderBy(asc(installmentPlans.firstPaymentDate))
        .all(),

    create(input: InstallmentInput): InstallmentPlan {
      validate(input);
      const id = newId();
      db.insert(installmentPlans)
        .values({ ...input, id })
        .run();
      return getById(id)!;
    },

    update(id: string, patch: InstallmentPatch): InstallmentPlan | undefined {
      validate(patch);
      db.update(installmentPlans)
        .set({ ...patch, updatedAt: nowTimestamp() })
        .where(eq(installmentPlans.id, id))
        .run();
      return getById(id);
    },

    delete(id: string): void {
      db.delete(installmentPlans).where(eq(installmentPlans.id, id)).run();
    },
  };
}
