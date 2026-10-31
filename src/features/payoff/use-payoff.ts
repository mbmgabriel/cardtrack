import { repos } from '@/db';
import { useLiveData } from '@/db/live';
import type { Account } from '@/db/schema';
import { todayISO } from '@/domain/dates';
import { installmentStatus, monthlyInstallmentsByAccount } from '@/domain/installments';
import { estimatedMinimumCents, type Debt, type PayoffBaseline } from '@/domain/payoff';
import { isLiabilityAccount } from '@/domain/types';
import { withSummaries } from '@/features/accounts/account-summaries';

export type PayoffDebt = Debt & {
  account: Account;
  /** True when the minimum is our estimate rather than one the user entered. */
  estimated: boolean;
};

/**
 * Everything the payoff planner needs: each debt (cards, lines of credit, loans with a balance)
 * with its minimum payment, and the saved plan settings.
 */
export function usePayoff() {
  return useLiveData(() => {
    const settings = repos.settings.getAll();
    const today = todayISO();
    const plans = repos.installments.list();
    // Instalments still running on each card: billed in full each month, on top of the minimum.
    const installmentMonthly = monthlyInstallmentsByAccount(plans, today);
    const installmentLeft = new Map<string, number>();
    for (const plan of plans) {
      const left = installmentStatus(plan, today).remainingCents;
      installmentLeft.set(plan.accountId, (installmentLeft.get(plan.accountId) ?? 0) + left);
    }
    const items = withSummaries(repos.accounts.list(), repos.transactions.totalsByAccount());
    // What every debt account owes now, including ones already paid off (for progress).
    const owedNow: Record<string, number> = Object.fromEntries(
      items
        .filter(({ account }) => isLiabilityAccount(account.type))
        .map(({ account, summary }) => [account.id, Math.max(0, summary.balanceCents)]),
    );
    const debts: PayoffDebt[] = items
      .filter(
        ({ account, summary }) => isLiabilityAccount(account.type) && summary.balanceCents > 0,
      )
      .map(({ account, summary }) => {
        const set = settings.payoff_minimums[account.id];
        return {
          id: account.id,
          name: account.name,
          balanceCents: summary.balanceCents,
          aprBps: account.interestRateBps,
          // Estimate: the instalments due, plus the usual minimum on the rest of the balance.
          minimumCents:
            set ??
            Math.min(
              summary.balanceCents,
              (installmentMonthly.get(account.id) ?? 0) +
                estimatedMinimumCents(
                  Math.max(0, summary.balanceCents - (installmentLeft.get(account.id) ?? 0)),
                ),
            ),
          estimated: set == null,
          account,
        };
      });
    return {
      debts,
      owedNow,
      baselines: settings.payoff_baselines,
      strategy: settings.payoff_strategy,
      extraCents: settings.payoff_extra_cents,
    };
  }, ['accounts', 'transactions', 'installment_plans', 'settings']);
}

export function setPayoffStrategy(strategy: 'avalanche' | 'snowball') {
  repos.settings.set('payoff_strategy', strategy);
}

export function setPayoffExtra(cents: number) {
  repos.settings.set('payoff_extra_cents', cents);
}

/** Save the minimum payment for one debt, or clear it (null) to go back to the estimate. */
export function setPayoffMinimum(accountId: string, cents: number | null) {
  const all = { ...repos.settings.get('payoff_minimums') };
  if (cents == null) delete all[accountId];
  else all[accountId] = cents;
  repos.settings.set('payoff_minimums', all);
}

/** Start (or restart) tracking a plan for one currency, from today. */
export function startTracking(currency: string, baseline: PayoffBaseline) {
  repos.settings.set('payoff_baselines', {
    ...repos.settings.get('payoff_baselines'),
    [currency]: baseline,
  });
}

export function stopTracking(currency: string) {
  const all = { ...repos.settings.get('payoff_baselines') };
  delete all[currency];
  repos.settings.set('payoff_baselines', all);
}
