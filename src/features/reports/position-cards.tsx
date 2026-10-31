import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

import { Panel } from '@/components/page-kit';
import { formatCents } from '@/domain/money';
import type { NetWorth, SafeToSpend } from '@/domain/position';
import { statusColors } from '@/theme';

/** "−$1,234.00" / "+$1,234.00" for the lines of a sum. */
function signed(cents: number, currency: string, locale: string, sign: '+' | '−') {
  return `${sign}${formatCents(Math.abs(cents), currency, locale)}`;
}

/** Net worth: one number, a have-versus-owe bar, and what each side is made of. */
export function NetWorthCard({ worth, locale }: { worth: NetWorth; locale: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const money = (cents: number) => formatCents(cents, worth.currency, locale);
  const have = Math.max(0, worth.assetsCents);
  const owe = Math.max(0, worth.debtsCents);
  const total = have + owe;
  const muted = theme.colors.onSurfaceVariant;

  return (
    <Panel>
      <Text variant="titleSmall" style={styles.bold}>
        {t('reports.netWorth')}
      </Text>
      <Text
        style={[styles.big, { color: theme.colors.onSurface }]}
        numberOfLines={1}
        adjustsFontSizeToFit>
        {money(worth.netCents)}
      </Text>

      {total > 0 ? (
        <View
          style={styles.split}
          accessible
          accessibilityLabel={`${t('reports.have')} ${money(worth.assetsCents)}, ${t('reports.owe')} ${money(worth.debtsCents)}`}>
          {have > 0 ? (
            <View style={[styles.part, { flex: have, backgroundColor: theme.colors.primary }]} />
          ) : null}
          {owe > 0 ? (
            <View style={[styles.part, { flex: owe, backgroundColor: theme.colors.onSurface }]} />
          ) : null}
        </View>
      ) : null}

      <View style={styles.columns}>
        <Side
          label={t('reports.have')}
          amount={money(worth.assetsCents)}
          swatch={theme.colors.primary}
          lines={worth.assets.map((a) => `${t(`accountTypes.${a.type}`)} ${money(a.cents)}`)}
          muted={muted}
        />
        <Side
          label={t('reports.owe')}
          amount={money(worth.debtsCents)}
          swatch={theme.colors.onSurface}
          lines={worth.debts.map((d) => `${t(`accountTypes.${d.type}`)} ${money(d.cents)}`)}
          muted={muted}
        />
      </View>
    </Panel>
  );
}

function Side({
  label,
  amount,
  swatch,
  lines,
  muted,
}: {
  label: string;
  amount: string;
  swatch: string;
  lines: string[];
  muted: string;
}) {
  return (
    <View style={styles.side}>
      <View style={styles.legend}>
        <View style={[styles.swatch, { backgroundColor: swatch }]} />
        <Text variant="labelLarge" style={{ color: muted }}>
          {label}
        </Text>
      </View>
      <Text variant="titleMedium" style={styles.bold}>
        {amount}
      </Text>
      {lines.map((line) => (
        <Text key={line} variant="bodySmall" style={{ color: muted }} numberOfLines={1}>
          {line}
        </Text>
      ))}
    </View>
  );
}

/**
 * Safe to spend, written out as a little sum so the user can see exactly how it's reached,
 * with what's deliberately left out (credit, savings, income) underneath.
 */
export function SafeToSpendCard({ safe, locale }: { safe: SafeToSpend; locale: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const status = statusColors(theme);
  const money = (cents: number) => formatCents(cents, safe.currency, locale);
  const short = safe.safeCents < 0;
  const tone = short ? theme.colors.error : status.success;
  const muted = theme.colors.onSurfaceVariant;
  const notCounted = [
    safe.availableCreditCents > 0
      ? t('reports.notCountedCredit', { amount: money(safe.availableCreditCents) })
      : null,
    safe.savingsCents > 0
      ? t('reports.notCountedSavings', { amount: money(safe.savingsCents) })
      : null,
    t('reports.notCountedIncome'),
  ].filter((s): s is string => s != null);

  const line = (label: string, value: string, icon: string) => (
    <View style={styles.line} accessible accessibilityLabel={`${label} ${value}`}>
      <Icon source={icon} size={18} color={muted} />
      <Text variant="bodyLarge" style={styles.flex}>
        {label}
      </Text>
      <Text variant="bodyLarge" style={styles.figure}>
        {value}
      </Text>
    </View>
  );

  return (
    <Panel>
      <View style={styles.titleRow}>
        <Text variant="titleSmall" style={[styles.bold, styles.flex]}>
          {t('reports.safeTitle')}
        </Text>
        <Text variant="labelMedium" style={{ color: muted }}>
          {t('reports.safeWindow')}
        </Text>
      </View>
      <Text style={[styles.big, { color: tone }]} numberOfLines={1} adjustsFontSizeToFit>
        {money(safe.safeCents)}
      </Text>
      {short ? (
        <Text variant="bodyMedium" style={{ color: tone }}>
          {t('reports.safeShortfall', { amount: money(-safe.safeCents) })}
        </Text>
      ) : null}

      <View style={[styles.sum, { borderColor: theme.colors.outlineVariant }]}>
        {line(
          t('reports.safeCash'),
          signed(safe.cashCents, safe.currency, locale, safe.cashCents < 0 ? '−' : '+'),
          'wallet-outline',
        )}
        {line(
          t('reports.safePayments'),
          signed(safe.paymentsDueCents, safe.currency, locale, '−'),
          'credit-card-clock-outline',
        )}
        {line(
          t('reports.safeBills'),
          signed(safe.billsCents, safe.currency, locale, '−'),
          'calendar-sync',
        )}
        <View style={[styles.rule, { backgroundColor: theme.colors.outlineVariant }]} />
        <View style={styles.line}>
          <Icon source="equal" size={18} color={muted} />
          <Text variant="titleMedium" style={[styles.flex, styles.bold]}>
            {t('reports.safeTitle')}
          </Text>
          <Text variant="titleMedium" style={[styles.figure, { color: tone }]}>
            {money(safe.safeCents)}
          </Text>
        </View>
      </View>

      <Text variant="bodySmall" style={{ color: muted }}>
        {t('reports.safeNotCounted', { items: notCounted.join(' · ') })}
      </Text>
    </Panel>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  big: { fontSize: 40, lineHeight: 48, fontWeight: '800', letterSpacing: -1.5 },
  split: { flexDirection: 'row', height: 12, gap: 3, borderRadius: 6, overflow: 'hidden' },
  part: { borderRadius: 3 },
  columns: { flexDirection: 'row', gap: 16 },
  side: { flex: 1, gap: 2 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  sum: { borderTopWidth: 1, paddingTop: 8, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
  figure: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  rule: { height: 1, marginVertical: 4 },
});
