import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon, Text, useTheme } from 'react-native-paper';

import type { Account, Category, Transaction } from '@/db/schema';
import { addDaysISO, parseISODate } from '@/domain/dates';
import { categoryLabel } from '@/features/categories/category-label';
import { statusColors } from '@/theme';
import { formatSignedCents } from '@/features/transactions/transaction-row';

import { MASK, usePrivateMoney } from './privacy';

type Props = {
  transactions: readonly Transaction[];
  accounts: ReadonlyMap<string, Account>;
  categories: ReadonlyMap<string, Category>;
  today: string;
  locale: string;
  /** Show which account each row is on (when looking at all cards). */
  showAccount: boolean;
  onOpen: (id: string) => void;
  onViewAll: () => void;
};

/** The latest few transactions, in a sheet-like card at the bottom of the dashboard. */
export function RecentActivity({
  transactions,
  accounts,
  categories,
  today,
  locale,
  showAccount,
  onOpen,
  onViewAll,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const muted = theme.colors.onSurfaceVariant;
  const { hidden } = usePrivateMoney(locale);
  const day = (date: string) =>
    date === today
      ? t('dashboard.today')
      : date === addDaysISO(today, -1)
        ? t('dashboard.yesterday')
        : new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(
            parseISODate(date),
          );

  return (
    <View
      style={[
        styles.sheet,
        {
          backgroundColor: theme.colors.elevation.level1,
          borderColor: theme.colors.outlineVariant,
        },
      ]}>
      <View style={[styles.handle, { backgroundColor: theme.colors.outlineVariant }]} />
      <View style={styles.header}>
        <Text variant="titleLarge" accessibilityRole="header" style={styles.title}>
          {t('dashboard.recent')}
        </Text>
        <Pressable
          onPress={onViewAll}
          accessibilityRole="button"
          hitSlop={12}
          style={({ pressed }) => pressed && styles.pressed}>
          <Text variant="titleSmall" style={styles.title}>
            {t('dashboard.viewAll')}
          </Text>
        </Pressable>
      </View>

      {transactions.length === 0 ? (
        <Text variant="bodyMedium" style={[styles.empty, { color: muted }]}>
          {t('dashboard.noRecent')}
        </Text>
      ) : (
        transactions.map((tx, i) => {
          const category = tx.categoryId ? categories.get(tx.categoryId) : undefined;
          const account = accounts.get(tx.accountId);
          const real = formatSignedCents(tx.amountCents, account?.currency ?? 'CAD', locale);
          const amount = hidden ? MASK : real;
          const income = tx.amountCents > 0;
          const meta = [
            day(tx.date),
            tx.status === 'pending' ? t('transactionStatuses.pending') : null,
            showAccount ? account?.name : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <Animated.View key={tx.id} entering={FadeInDown.delay(i * 40).duration(300)}>
              <Pressable
                onPress={() => onOpen(tx.id)}
                accessibilityRole="button"
                accessibilityLabel={`${tx.payee}, ${hidden ? t('dashboard.amountHidden') : real}, ${meta}`}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <View style={[styles.icon, { backgroundColor: theme.colors.surfaceVariant }]}>
                  <Icon
                    source={category?.icon ?? 'receipt-text-outline'}
                    size={22}
                    color={theme.colors.onSurface}
                  />
                </View>
                <View style={styles.flex}>
                  <Text variant="titleMedium" numberOfLines={1} style={styles.payee}>
                    {tx.payee}
                  </Text>
                  <Text variant="bodySmall" numberOfLines={1} style={{ color: muted }}>
                    {category && !showAccount ? `${meta} · ${categoryLabel(category, t)}` : meta}
                  </Text>
                </View>
                <Text
                  variant="titleMedium"
                  style={[
                    styles.amount,
                    {
                      color: income ? statusColors(theme).success : theme.colors.onSurface,
                    },
                    tx.status === 'void' && styles.void,
                  ]}>
                  {amount}
                </Text>
              </Pressable>
            </Animated.View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheet: {
    borderWidth: 1,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: { fontWeight: '700' },
  empty: { paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64 },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  payee: { fontWeight: '600' },
  amount: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  void: { textDecorationLine: 'line-through', opacity: 0.6 },
  pressed: { opacity: 0.7 },
});
