import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

import { Panel, RowDivider } from '@/components/page-kit';
import { repos } from '@/db';
import { useLiveData } from '@/db/live';
import { parseISODate, todayISO } from '@/domain/dates';
import { installmentAmountCents, installmentStatus } from '@/domain/installments';
import { formatCents } from '@/domain/money';
import { useLocale } from '@/i18n/use-locale';
import { statusColors } from '@/theme';

/** Account detail → Installments: the card's running plans, then the finished ones. */
export function InstallmentsTab({ accountId, currency }: { accountId: string; currency: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const today = todayISO();
  const plans = useLiveData(
    () => repos.installments.listByAccount(accountId),
    ['installment_plans'],
  ).map((plan) => ({ plan, status: installmentStatus(plan, today) }));
  const running = plans.filter((p) => !p.status.done);
  const finished = plans.filter((p) => p.status.done);
  const money = (cents: number) => formatCents(cents, currency, locale);
  const muted = theme.colors.onSurfaceVariant;
  const status = statusColors(theme);
  const monthYear = (iso: string) =>
    new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(parseISODate(iso));
  const shortDate = (iso: string) =>
    new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(parseISODate(iso));
  const monthlyTotal = running.reduce(
    (sum, p) => sum + installmentAmountCents(p.plan, p.status.paidCount),
    0,
  );

  if (plans.length === 0) {
    return (
      <Panel>
        <Icon source="calendar-month-outline" size={28} color={theme.colors.primary} />
        <Text variant="titleMedium" style={styles.bold}>
          {t('installments.emptyTitle')}
        </Text>
        <Text variant="bodyMedium" style={{ color: muted }}>
          {t('installments.emptyBody')}
        </Text>
      </Panel>
    );
  }

  const row = ({ plan, status: s }: (typeof plans)[number], index: number) => (
    <View key={plan.id}>
      {index > 0 ? <RowDivider flush /> : null}
      <Pressable
        onPress={() => router.push({ pathname: '/installment/[id]', params: { id: plan.id } })}
        accessibilityRole="button"
        accessibilityLabel={[
          plan.description,
          s.done
            ? t('installments.finished', { date: monthYear(s.lastDate) })
            : t('installments.progress', {
                paid: s.paidCount,
                months: plan.months,
                left: money(s.remainingCents),
                end: monthYear(s.lastDate),
              }),
        ].join(', ')}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <View style={styles.top}>
          <Text variant="titleMedium" numberOfLines={1} style={[styles.flex, styles.bold]}>
            {plan.description}
          </Text>
          <Text variant="titleMedium" style={styles.bold}>
            {s.done
              ? money(plan.principalCents)
              : t('installments.perMonth', {
                  amount: money(installmentAmountCents(plan, s.paidCount)),
                })}
          </Text>
        </View>
        <View style={[styles.track, { backgroundColor: theme.colors.surfaceVariant }]}>
          <View
            style={[
              styles.fill,
              {
                width: `${s.progress * 100}%`,
                backgroundColor: s.done ? status.success : theme.colors.primary,
              },
            ]}
          />
        </View>
        <Text variant="bodySmall" style={{ color: muted }}>
          {s.done
            ? t('installments.finished', { date: monthYear(s.lastDate) })
            : t('installments.progress', {
                paid: s.paidCount,
                months: plan.months,
                left: money(s.remainingCents),
                end: monthYear(s.lastDate),
              })}
          {s.nextDate ? ` · ${t('installments.next', { date: shortDate(s.nextDate) })}` : ''}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.list}>
      {running.length > 0 ? (
        <Panel
          title={t('installments.running')}
          trailing={t('installments.monthlyTotal', { amount: money(monthlyTotal) })}
          padded={false}>
          {running.map(row)}
        </Panel>
      ) : null}
      {finished.length > 0 ? (
        <Panel title={t('installments.done')} padded={false}>
          {finished.map(row)}
        </Panel>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  list: { gap: 12 },
  row: { padding: 16, gap: 8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  pressed: { opacity: 0.7 },
});
