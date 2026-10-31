import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconButton, Text, TouchableRipple, useTheme } from 'react-native-paper';

import { isHighUtilization } from '@/domain/balances';
import { formatCents } from '@/domain/money';

import type { AccountWithSummary } from './account-summaries';
import { CardThumb } from './card-thumb';
import { statusColors } from '@/theme';

type ReorderControls = {
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

type Props = AccountWithSummary & {
  locale: string;
  onPress?: () => void;
  reorder?: ReorderControls;
};

export function AccountTile({ account, summary, locale, onPress, reorder }: Props) {
  const { t } = useTranslation();
  const money = (cents: number) => formatCents(cents, account.currency, locale);
  const percent = (ratio: number) =>
    new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(ratio);

  const balanceLabel = summary.isLiability ? t('accounts.owed') : t('accounts.balance');
  const high = isHighUtilization(summary.utilization);
  const details = [account.institution, account.network ? t(`networks.${account.network}`) : null];
  // Visually "•• 1234"; screen readers hear "ending in 1234".
  const subtitle = [...details, account.last4 ? `•• ${account.last4}` : null]
    .filter(Boolean)
    .join(' · ');
  const spokenSubtitle = [
    ...details,
    account.last4 ? t('accounts.endingIn', { last4: account.last4 }) : null,
  ]
    .filter(Boolean)
    .join(', ');

  const a11yLabel = [
    account.name,
    spokenSubtitle,
    account.isArchived ? t('accounts.archived') : null,
    `${balanceLabel} ${money(summary.balanceCents)}`,
    summary.availableCreditCents != null
      ? t('accounts.available', { amount: money(summary.availableCreditCents) })
      : null,
    summary.utilization != null
      ? t('accounts.utilization', { percent: percent(summary.utilization) })
      : null,
    high ? t('accounts.highUtilization') : null,
  ]
    .filter(Boolean)
    .join(', ');

  const theme = useTheme();
  const muted = theme.colors.onSurfaceVariant;
  const warn = statusColors(theme).warning;

  const content = (
    <View style={styles.content}>
      <View style={styles.headerRow}>
        {/* The card itself, small, in its own colour: the one splash of colour on the tile. */}
        <CardThumb account={account} size="lg" showDigits />
        <View style={styles.titleBlock}>
          <Text variant="titleMedium" numberOfLines={1} style={styles.name}>
            {account.name}
          </Text>
          {subtitle ? (
            <Text variant="bodySmall" numberOfLines={1} style={{ color: muted }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.balance}>
          <Text style={[styles.amount, { color: theme.colors.onSurface }]} numberOfLines={1}>
            {money(summary.balanceCents)}
          </Text>
          <Text variant="labelSmall" style={{ color: muted }}>
            {account.isArchived ? t('accounts.archived') : balanceLabel}
          </Text>
        </View>
      </View>

      {summary.utilization != null && summary.availableCreditCents != null ? (
        <View style={styles.utilization}>
          <View style={[styles.track, { backgroundColor: theme.colors.surfaceVariant }]}>
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.min(1, summary.utilization) * 100}%`,
                  backgroundColor: high ? warn : theme.colors.onSurface,
                },
              ]}
            />
          </View>
          <View style={styles.utilizationRow}>
            <Text variant="bodySmall" style={{ color: muted }}>
              {t('accounts.available', { amount: money(summary.availableCreditCents) })}
            </Text>
            <Text variant="bodySmall" style={{ color: high ? warn : muted }}>
              {high ? '⚠ ' : ''}
              {t('accounts.utilization', { percent: percent(summary.utilization) })}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );

  return (
    <View
      style={[
        styles.tile,
        {
          backgroundColor: theme.colors.elevation.level1,
          borderColor: theme.colors.outlineVariant,
        },
        account.isArchived && styles.archived,
      ]}>
      {reorder ? (
        <View style={styles.reorderRow} accessible={false}>
          <View style={styles.flex} accessible accessibilityLabel={a11yLabel}>
            {content}
          </View>
          <View>
            <IconButton
              icon="arrow-up"
              disabled={!reorder.canMoveUp}
              onPress={reorder.onMoveUp}
              accessibilityLabel={t('accounts.moveUp', { name: account.name })}
            />
            <IconButton
              icon="arrow-down"
              disabled={!reorder.canMoveDown}
              onPress={reorder.onMoveDown}
              accessibilityLabel={t('accounts.moveDown', { name: account.name })}
            />
          </View>
        </View>
      ) : (
        <TouchableRipple
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}>
          {content}
        </TouchableRipple>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: 24, borderWidth: 1, overflow: 'hidden' },
  archived: { opacity: 0.7 },
  content: { padding: 16, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  titleBlock: { flex: 1, gap: 2 },
  name: { fontWeight: '700' },
  balance: { alignItems: 'flex-end', maxWidth: '45%' },
  amount: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  utilization: { gap: 6 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  utilizationRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  reorderRow: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});
