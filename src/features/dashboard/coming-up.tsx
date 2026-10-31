import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Button, Text, TouchableRipple, useTheme } from 'react-native-paper';

import { addDaysISO, parseISODate } from '@/domain/dates';
import type { DueUrgency } from '@/domain/dashboard';

import type { TimelineDay, TimelineItem, UpcomingDue } from './dashboard-data';
import { usePrivateMoney } from './privacy';
import { statusColors } from '@/theme';

/** Rows after this many appear together rather than one by one. */
const STAGGER_LIMIT = 8;

type Props = {
  days: readonly TimelineDay[];
  today: string;
  locale: string;
  onOpenAccount: (accountId: string) => void;
  /** Log a payment toward this due date (pre-filled with what's owed). */
  onRecordPayment: (due: UpcomingDue) => void;
};

/** "Coming up": due dates and recurring charges on one day-by-day timeline. */
export function ComingUp({ days, today, locale, onOpenAccount, onRecordPayment }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const muted = theme.colors.onSurfaceVariant;
  const { money, spoken } = usePrivateMoney(locale);
  const urgencyColor: Record<DueUrgency, string> = {
    overdue: theme.colors.error,
    urgent: theme.colors.error,
    soon: statusColors(theme).warning,
    later: muted,
  };
  const dayLabel = (date: string) =>
    date === today
      ? t('dashboard.today')
      : date === addDaysISO(today, 1)
        ? t('dashboard.tomorrow')
        : new Intl.DateTimeFormat(locale, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          }).format(parseISODate(date));

  let order = 0;
  const row = (item: TimelineItem) => {
    const delay = Math.min(order++, STAGGER_LIMIT) * 45;
    if (item.kind === 'due') {
      const { due } = item;
      const when =
        due.urgency === 'overdue'
          ? t('dashboard.overdue')
          : due.daysUntil === 0
            ? t('dashboard.dueToday')
            : t('dashboard.dueIn', { count: due.daysUntil });
      const amount = money(due.owedCents, due.account.currency);
      const said = spoken(due.owedCents, due.account.currency);
      return (
        <Animated.View
          key={item.key}
          entering={FadeInDown.delay(delay).duration(380)}
          layout={LinearTransition}>
          <TouchableRipple
            onPress={() => onOpenAccount(due.account.id)}
            accessibilityRole="button"
            accessibilityLabel={`${t('dashboard.paymentDue', { name: due.account.name })}, ${when}, ${said}`}
            style={styles.row}>
            <View style={styles.rowInner}>
              <View style={[styles.marker, { backgroundColor: due.account.color }]} />
              <View style={styles.flex}>
                <Text variant="bodyLarge" numberOfLines={1}>
                  {t('dashboard.paymentDue', { name: due.account.name })}
                </Text>
                <Text variant="bodySmall" style={{ color: urgencyColor[due.urgency] }}>
                  {when}
                </Text>
              </View>
              <Text variant="bodyLarge">{amount}</Text>
            </View>
          </TouchableRipple>
          {due.owedCents > 0 ? (
            <Button
              mode="contained-tonal"
              compact
              icon="cash-check"
              onPress={() => onRecordPayment(due)}
              accessibilityLabel={t('dashboard.recordPaymentFor', { name: due.account.name })}
              style={styles.pay}
              contentStyle={styles.payContent}>
              {t('dashboard.recordPayment')}
            </Button>
          ) : null}
        </Animated.View>
      );
    }
    if (item.kind === 'installment') {
      const { installment: due } = item;
      const amount = money(due.amountCents, due.account.currency);
      const said = spoken(due.amountCents, due.account.currency);
      const title = t('installments.comingUp', { name: due.plan.description });
      const detail = t('installments.comingUpDetail', {
        number: due.number,
        months: due.plan.months,
        card: due.account.name,
      });
      return (
        <Animated.View
          key={item.key}
          entering={FadeInDown.delay(delay).duration(380)}
          layout={LinearTransition}>
          <TouchableRipple
            onPress={() => onOpenAccount(due.account.id)}
            accessibilityRole="button"
            accessibilityLabel={`${title}, ${detail}, ${said}`}
            style={styles.row}>
            <View style={styles.rowInner}>
              {/* Square = an instalment on that card. */}
              <View
                style={[styles.marker, styles.square, { backgroundColor: due.account.color }]}
              />
              <View style={styles.flex}>
                <Text variant="bodyLarge" numberOfLines={1}>
                  {title}
                </Text>
                <Text variant="bodySmall" style={{ color: muted }} numberOfLines={1}>
                  {detail}
                </Text>
              </View>
              <Text variant="bodyLarge">{amount}</Text>
            </View>
          </TouchableRipple>
        </Animated.View>
      );
    }
    const { charge } = item;
    const amount = money(Math.abs(charge.rule.amountCents), charge.account.currency);
    const said = spoken(Math.abs(charge.rule.amountCents), charge.account.currency);
    return (
      <Animated.View
        key={item.key}
        entering={FadeInDown.delay(delay).duration(380)}
        layout={LinearTransition}>
        <TouchableRipple
          onPress={() => onOpenAccount(charge.account.id)}
          accessibilityRole="button"
          accessibilityLabel={`${charge.rule.payee}, ${said}, ${charge.account.name}`}
          style={styles.row}>
          <View style={styles.rowInner}>
            <View style={[styles.marker, styles.hollow, { borderColor: charge.account.color }]} />
            <View style={styles.flex}>
              <Text variant="bodyLarge" numberOfLines={1}>
                {charge.rule.payee}
              </Text>
              <Text variant="bodySmall" style={{ color: muted }} numberOfLines={1}>
                {charge.account.name}
              </Text>
            </View>
            <Text variant="bodyLarge">
              {charge.rule.amountCents > 0 ? '+' : ''}
              {amount}
            </Text>
          </View>
        </TouchableRipple>
      </Animated.View>
    );
  };

  if (days.length === 0) {
    return (
      <Text variant="bodyMedium" style={{ color: muted }}>
        {t('dashboard.nothingComingUp')}
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      {days.map((day) => (
        <Animated.View key={day.date} layout={LinearTransition} style={styles.day}>
          <Text variant="labelMedium" accessibilityRole="header" style={{ color: muted }}>
            {dayLabel(day.date)}
          </Text>
          {day.items.map(row)}
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: 12 },
  day: { gap: 2 },
  row: { borderRadius: 12, minHeight: 52, justifyContent: 'center' },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  // Filled dot = payment due on that card; ring = a recurring charge on it.
  marker: { width: 10, height: 10, borderRadius: 5 },
  hollow: { backgroundColor: 'transparent', borderWidth: 2 },
  square: { borderRadius: 2 },
  // Lines up with the row's text, past the marker.
  pay: { alignSelf: 'flex-start', marginLeft: 22, marginBottom: 6 },
  payContent: { minHeight: 44 },
});
