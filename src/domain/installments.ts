/**
 * Instalment plans (a purchase paid in equal monthly parts on a card): where a plan stands today.
 * One instalment falls on the first payment date and on the same day of each later month (the
 * last day for shorter months); an instalment counts as paid once its date has passed.
 */
import { addMonths, format } from 'date-fns';

import { daysBetween, parseISODate } from './dates';

export type InstallmentLike = {
  principalCents: number;
  months: number;
  monthlyCents: number;
  monthlyFeeCents: number;
  firstPaymentDate: string;
};

export type InstallmentStatus = {
  paidCount: number;
  remainingCount: number;
  /** Principal still to be billed: the instalments left (the last one takes any rounding). */
  remainingCents: number;
  /** Next instalment date, or null when the plan is finished. */
  nextDate: string | null;
  lastDate: string;
  done: boolean;
  /** Share of instalments paid (0–1). */
  progress: number;
};

/** The date of instalment `n` (0 = the first). */
export function installmentDate(
  plan: Pick<InstallmentLike, 'firstPaymentDate'>,
  n: number,
): string {
  return format(addMonths(parseISODate(plan.firstPaymentDate), n), 'yyyy-MM-dd');
}

/** An even monthly amount for a purchase, rounded up to the cent (the last one comes in under). */
export function evenInstallmentCents(principalCents: number, months: number): number {
  return months > 0 ? Math.ceil(principalCents / months) : principalCents;
}

export function installmentStatus(plan: InstallmentLike, today: string): InstallmentStatus {
  let paidCount = 0;
  while (paidCount < plan.months && installmentDate(plan, paidCount) <= today) paidCount++;
  const remainingCount = plan.months - paidCount;
  const billed = Math.min(plan.principalCents, paidCount * plan.monthlyCents);
  return {
    paidCount,
    remainingCount,
    remainingCents: Math.max(0, plan.principalCents - billed),
    nextDate: remainingCount > 0 ? installmentDate(plan, paidCount) : null,
    lastDate: installmentDate(plan, plan.months - 1),
    done: remainingCount === 0,
    progress: plan.months > 0 ? paidCount / plan.months : 1,
  };
}

/** What one instalment bills: the part (the last one takes any rounding) plus any monthly fee. */
export function installmentAmountCents(plan: InstallmentLike, n: number): number {
  const part =
    n === plan.months - 1
      ? plan.principalCents - plan.monthlyCents * (plan.months - 1)
      : plan.monthlyCents;
  return Math.max(0, part) + plan.monthlyFeeCents;
}

export type UpcomingInstallment<P> = {
  plan: P;
  date: string;
  /** 1-based number of this instalment, e.g. 5 of 12. */
  number: number;
  amountCents: number;
  daysUntil: number;
};

/** Instalments falling from today through `days` days ahead, soonest first. */
export function upcomingInstallments<P extends InstallmentLike>(
  plans: readonly P[],
  today: string,
  days: number,
): UpcomingInstallment<P>[] {
  const result: UpcomingInstallment<P>[] = [];
  for (const plan of plans) {
    for (let n = 0; n < plan.months; n++) {
      const date = installmentDate(plan, n);
      const until = daysBetween(today, date);
      if (until < 0) continue;
      if (until > days) break;
      result.push({
        plan,
        date,
        number: n + 1,
        amountCents: installmentAmountCents(plan, n),
        daysUntil: until,
      });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

/** The monthly amount still being billed for each account's running plans (for minimums). */
export function monthlyInstallmentsByAccount<P extends InstallmentLike & { accountId: string }>(
  plans: readonly P[],
  today: string,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const plan of plans) {
    const status = installmentStatus(plan, today);
    if (status.done) continue;
    totals.set(
      plan.accountId,
      (totals.get(plan.accountId) ?? 0) + installmentAmountCents(plan, status.paidCount),
    );
  }
  return totals;
}
