import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Button, Icon, Text, useTheme } from 'react-native-paper';

import { Panel } from '@/components/page-kit';
import { parseISODate } from '@/domain/dates';
import { formatCents } from '@/domain/money';
import type { PayoffBaseline, PlanProgress } from '@/domain/payoff';
import { statusColors } from '@/theme';

type Props = {
  baseline: PayoffBaseline;
  progress: PlanProgress;
  currency: string;
  locale: string;
  /** The monthly amount on screen now, to say when it differs from the tracked plan's. */
  monthlyNowCents: number;
  onRestart: () => void;
  onStop: () => void;
};

/**
 * How the user is doing against the plan they chose to track: on track, ahead or behind (in
 * words and dollars, never colour alone), what's owed now against what the plan expected, and
 * what to do about it.
 */
export function ProgressCard({
  baseline,
  progress,
  currency,
  locale,
  monthlyNowCents,
  onRestart,
  onStop,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const status = statusColors(theme);
  const money = (cents: number) => formatCents(cents, currency, locale);
  const muted = theme.colors.onSurfaceVariant;
  const gap = money(Math.abs(progress.differenceCents));
  const look = {
    onTrack: { icon: 'check-circle', tone: status.success, soft: status.successSoft },
    ahead: { icon: 'rocket-launch-outline', tone: status.success, soft: status.successSoft },
    behind: {
      icon: 'alert-circle-outline',
      tone: status.warning,
      soft: theme.colors.surfaceVariant,
    },
  }[progress.status];
  const headline = {
    onTrack: t('payoff.progressOnTrack'),
    ahead: t('payoff.progressAhead', { amount: gap }),
    behind: t('payoff.progressBehind', { amount: gap }),
  }[progress.status];
  const advice = {
    onTrack: t('payoff.progressOnTrackHelp'),
    ahead: t('payoff.progressAheadHelp'),
    behind: t('payoff.progressBehindHelp', { amount: gap }),
  }[progress.status];
  const started = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(
    parseISODate(baseline.startedOn),
  );

  return (
    <Panel title={t('payoff.progressTitle')}>
      <View
        style={[styles.badge, { backgroundColor: look.soft }]}
        accessible
        accessibilityLabel={`${headline}. ${advice}`}>
        <Icon source={look.icon} size={22} color={look.tone} />
        <View style={styles.flex}>
          <Text variant="titleMedium" style={[styles.bold, { color: look.tone }]}>
            {headline}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurface }}>
            {advice}
          </Text>
        </View>
      </View>

      <View style={styles.figures}>
        <View style={styles.figure}>
          <Text variant="labelMedium" style={{ color: muted }}>
            {t('payoff.owedNow')}
          </Text>
          <Text variant="titleLarge" style={styles.bold}>
            {money(progress.actualCents)}
          </Text>
        </View>
        <View style={styles.figure}>
          <Text variant="labelMedium" style={{ color: muted }}>
            {t('payoff.planExpected')}
          </Text>
          <Text variant="titleLarge" style={[styles.bold, { color: muted }]}>
            {money(progress.expectedCents)}
          </Text>
        </View>
      </View>

      {/* Paid off so far, with a tick where the plan expected to be by today. */}
      <View
        style={[styles.track, { backgroundColor: theme.colors.surfaceVariant }]}
        importantForAccessibility="no-hide-descendants">
        <View
          style={[
            styles.fill,
            { width: `${progress.paidShare * 100}%`, backgroundColor: theme.colors.primary },
          ]}
        />
        <View
          style={[
            styles.tick,
            { left: `${progress.expectedShare * 100}%`, backgroundColor: theme.colors.onSurface },
          ]}
        />
      </View>
      <Text variant="bodySmall" style={{ color: muted }}>
        {t('payoff.paidOffShare', {
          percent: new Intl.NumberFormat(locale, {
            style: 'percent',
            maximumFractionDigits: 0,
          }).format(progress.paidShare),
          start: money(baseline.balances[0] ?? 0),
        })}
      </Text>

      <Text variant="bodySmall" style={{ color: muted }}>
        {baseline.monthlyCents === monthlyNowCents
          ? t('payoff.trackingSince', { date: started, amount: money(baseline.monthlyCents) })
          : t('payoff.trackingChanged', { date: started, amount: money(baseline.monthlyCents) })}
      </Text>

      <View style={styles.actions}>
        <Button mode="text" icon="restart" onPress={onRestart} contentStyle={styles.tall}>
          {t('payoff.restart')}
        </Button>
        <Button mode="text" icon="close" onPress={onStop} contentStyle={styles.tall}>
          {t('payoff.stopTracking')}
        </Button>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18 },
  figures: { flexDirection: 'row', gap: 16 },
  figure: { flex: 1, gap: 2 },
  track: { height: 12, borderRadius: 6, overflow: 'visible', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 6 },
  tick: { position: 'absolute', width: 3, height: 20, borderRadius: 1.5, marginLeft: -1.5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8 },
  tall: { minHeight: 44 },
});
