import { createContext, useContext } from 'react';
import { useTranslation } from 'react-i18next';

import { formatCents } from '@/domain/money';

/** What a hidden amount looks like. */
export const MASK = '••••••';

const HiddenBalances = createContext(false);

/** Wrap the dashboard to hide (or show) every amount inside it. */
export const BalancePrivacy = HiddenBalances.Provider;

/**
 * Money formatting that respects "Hide the balance": `money` for what's on screen (dots when
 * hidden) and `spoken` for accessibility labels (says the amount is hidden rather than reading dots).
 */
export function usePrivateMoney(locale: string) {
  const { t } = useTranslation();
  const hidden = useContext(HiddenBalances);
  const money = (cents: number, currency: string) =>
    hidden ? MASK : formatCents(cents, currency, locale);
  const spoken = (cents: number, currency: string) =>
    hidden ? t('dashboard.amountHidden') : formatCents(cents, currency, locale);
  return { hidden, money, spoken };
}
