import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Text, TouchableRipple, useTheme } from 'react-native-paper';

import { chartColors } from '@/components/chart-colors';

import type { SpendingComparison } from './dashboard-data';
import { spendingPace } from './dashboard-data';
import { usePrivateMoney } from './privacy';
import { useCountUp } from './use-count-up';

type Props = {
  comparison: SpendingComparison;
  monthName: string;
  locale: string;
  onPress: () => void;
};

/**
 * This month's spending as a bar against last month's total, with a tick where last month stood
 * by the same day — ahead of the tick means spending faster than last month.
 */
export function SpendingPaceCard({ comparison, monthName, locale, onPress }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const colors = chartColors(theme);
  const pace = spendingPace(comparison);
  const spent = useCountUp(pace.spentCents);
  const privateMoney = usePrivateMoney(locale);
  const money = (cents: number) => privateMoney.money(cents, comparison.currency);
  const said = (cents: number) => privateMoney.spoken(cents, comparison.currency);
  const percent = (ratio: number) =>
    new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(ratio);

  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(pace.fill, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [pace.fill, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  const compare = (previous: string) =>
    pace.change == null
      ? t('dashboard.noComparison')
      : pace.change > 0
        ? t('dashboard.upVs', { percent: percent(pace.change), amount: previous })
        : pace.change < 0
          ? t('dashboard.downVs', { percent: percent(-pace.change), amount: previous })
          : t('dashboard.sameVs');
  const comparisonText = compare(money(comparison.lastMonthToDateCents));

  return (
    <TouchableRipple
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t('dashboard.paceTitle', { month: monthName })}, ${said(pace.spentCents)}, ${compare(said(comparison.lastMonthToDateCents))}`}
      accessibilityHint={t('dashboard.seeAll')}
      style={styles.touch}>
      <View style={styles.container}>
        <Text variant="displaySmall" style={styles.amount}>
          {money(spent)}
        </Text>
        <View style={[styles.track, { backgroundColor: colors.track }]}>
          <Animated.View style={[styles.fill, { backgroundColor: colors.series }, fillStyle]} />
          {comparison.lastMonthCents > 0 ? (
            <View
              style={[
                styles.tick,
                { left: `${pace.marker * 100}%`, backgroundColor: theme.colors.onSurface },
              ]}
            />
          ) : null}
        </View>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {comparisonText}
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {t('dashboard.lastMonthTotal', { amount: money(comparison.lastMonthCents) })}
        </Text>
      </View>
    </TouchableRipple>
  );
}

const styles = StyleSheet.create({
  touch: { borderRadius: 16 },
  container: { gap: 8, paddingVertical: 4 },
  amount: { letterSpacing: -0.5 },
  track: { height: 10, borderRadius: 5, overflow: 'visible', justifyContent: 'center' },
  fill: { height: 10, borderRadius: 5 },
  // Where last month stood by today: a thin tick across the bar.
  tick: { position: 'absolute', width: 2, height: 18, borderRadius: 1, marginLeft: -1 },
});
