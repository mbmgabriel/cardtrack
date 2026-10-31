import { addMonths } from 'date-fns';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

import { parseISODate, todayISO } from '@/domain/dates';
import { formatCents } from '@/domain/money';
import { planProgress, simulatePayoff } from '@/domain/payoff';
import { usePro } from '@/features/pro/use-pro';
import { useLocale } from '@/i18n/use-locale';
import { statusColors } from '@/theme';

import { usePayoff } from './use-payoff';

/**
 * The dashboard's way into the debt payoff planner: how a tracked plan is going, or the debt-free
 * date at the current monthly amount, or (for free users) what Pro would show. Hidden when
 * nothing is owed.
 */
export function PayoffSummaryCard() {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const pro = usePro();
  const { debts, owedNow, baselines, strategy, extraCents } = usePayoff();
  const status = statusColors(theme);
  if (debts.length === 0) return null;

  // One currency at a time: the one with the most owed.
  const totals = new Map<string, number>();
  for (const d of debts) {
    totals.set(d.account.currency, (totals.get(d.account.currency) ?? 0) + d.balanceCents);
  }
  const [currency] = [...totals].sort((a, b) => b[1] - a[1])[0];
  const inCurrency = debts.filter((d) => d.account.currency === currency);
  const money = (cents: number) => formatCents(cents, currency, locale);
  const today = todayISO();

  let icon = 'flag-checkered';
  let tone = theme.colors.primary;
  let title = t('payoff.cardTitle');
  let detail = t('payoff.cardTeaser');
  if (pro) {
    const baseline = baselines[currency];
    if (baseline) {
      const owed = baseline.debtIds.reduce((s, id) => s + (owedNow[id] ?? 0), 0);
      const progress = planProgress(baseline, owed, today);
      const gap = money(Math.abs(progress.differenceCents));
      ({ icon, tone } =
        progress.status === 'behind'
          ? { icon: 'alert-circle-outline', tone: status.warning }
          : { icon: 'check-circle', tone: status.success });
      title =
        progress.status === 'onTrack'
          ? t('payoff.progressOnTrack')
          : t(progress.status === 'ahead' ? 'payoff.progressAhead' : 'payoff.progressBehind', {
              amount: gap,
            });
    } else {
      title = t('payoff.cardTitle');
    }
    const plan = simulatePayoff(inCurrency, { strategy, extraCents });
    detail =
      plan.months != null
        ? t('payoff.cardDebtFree', {
            date: new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(
              addMonths(parseISODate(today), plan.months),
            ),
            amount: money(inCurrency.reduce((s, d) => s + d.balanceCents, 0)),
          })
        : t('payoff.cardNotOnTrack');
  }

  return (
    <Pressable
      onPress={() => router.push(pro ? '/payoff' : '/pro')}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${detail}`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.colors.elevation.level1,
          borderColor: theme.colors.outlineVariant,
        },
        pressed && styles.pressed,
      ]}>
      <View style={[styles.icon, { backgroundColor: theme.colors.surfaceVariant }]}>
        <Icon source={icon} size={24} color={tone} />
      </View>
      <View style={styles.flex}>
        <Text variant="titleMedium" style={styles.bold}>
          {title}
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {detail}
        </Text>
      </View>
      {pro ? null : (
        <View style={[styles.badge, { backgroundColor: theme.colors.primaryContainer }]}>
          <Text variant="labelSmall" style={{ color: theme.colors.onPrimaryContainer }}>
            {t('pro.badge')}
          </Text>
        </View>
      )}
      <Icon source="chevron-right" size={22} color={theme.colors.onSurfaceVariant} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    minHeight: 72,
  },
  icon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  pressed: { opacity: 0.75 },
});
