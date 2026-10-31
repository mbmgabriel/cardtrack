import { useTranslation } from 'react-i18next';
import {
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Icon, Text, TouchableRipple, useTheme } from 'react-native-paper';

import type { Account, Category, Transaction } from '@/db/schema';
import { parseISODate } from '@/domain/dates';
import { formatCents } from '@/domain/money';
import { categoryLabel } from '@/features/categories/category-label';
import { statusColors } from '@/theme';

const ACTION_WIDTH = 80;

export type RowActions = {
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Only offered for pending holds. */
  onMarkPosted?: () => void;
};

type Props = RowActions & {
  transaction: Transaction;
  currency: string;
  locale: string;
  category?: Category;
  /** Shown in cross-account lists (Activity). */
  account?: Pick<Account, 'name' | 'color'>;
  /** Posted balance after this row, or null when the row doesn't move it. */
  runningBalanceCents?: number | null;
  isLiability?: boolean;
  /** Corners and margins when the row is part of a grouped panel (see `groupedRow`). */
  style?: StyleProp<ViewStyle>;
};

export function formatSignedCents(cents: number, currency: string, locale: string): string {
  return `${cents > 0 ? '+' : ''}${formatCents(cents, currency, locale)}`;
}

export function TransactionRow({
  transaction: tx,
  currency,
  locale,
  category,
  account,
  runningBalanceCents,
  isLiability = false,
  style,
  onPress,
  onEdit,
  onDelete,
  onMarkPosted,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const amount = formatSignedCents(tx.amountCents, currency, locale);
  const isVoid = tx.status === 'void';
  const pending = tx.status === 'pending';
  const markPosted = pending ? onMarkPosted : undefined;
  const categoryName = category ? categoryLabel(category, t) : t('transactions.uncategorized');
  const balance =
    runningBalanceCents == null
      ? null
      : isLiability
        ? t('transactions.owedAfter', {
            amount: formatCents(
              runningBalanceCents === 0 ? 0 : -runningBalanceCents,
              currency,
              locale,
            ),
          })
        : t('transactions.balanceAfter', {
            amount: formatCents(runningBalanceCents, currency, locale),
          });
  const subtitle = [account?.name, categoryName].filter(Boolean).join(' · ');
  const statusLabel = tx.status === 'posted' ? null : t(`transactionStatuses.${tx.status}`);
  const amountColor = isVoid
    ? theme.colors.onSurfaceVariant
    : tx.amountCents > 0
      ? statusColors(theme).success
      : theme.colors.onSurface;

  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
    parseISODate(tx.date),
  );
  const a11yLabel = [
    t('transactions.rowLabel', { payee: tx.payee, amount, date }),
    subtitle,
    statusLabel,
    balance,
  ]
    .filter(Boolean)
    .join(', ');

  const a11yActions = [
    { name: 'edit', label: t('common.edit') },
    { name: 'delete', label: t('common.delete') },
    ...(markPosted ? [{ name: 'markPosted', label: t('transactions.markPosted') }] : []),
  ];
  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'edit') onEdit();
    else if (e.nativeEvent.actionName === 'delete') onDelete();
    else if (e.nativeEvent.actionName === 'markPosted') markPosted?.();
  };

  const action = (
    methods: SwipeableMethods,
    icon: string,
    label: string,
    color: string,
    onAction: () => void,
  ) => (
    <TouchableRipple
      key={label}
      onPress={() => {
        methods.close();
        onAction();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.action, { backgroundColor: color }]}>
      <View style={styles.actionContent}>
        <Icon source={icon} size={22} color="#FFFFFF" />
        <Text variant="labelSmall" style={styles.actionLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </TouchableRipple>
  );

  return (
    <Swipeable
      containerStyle={style}
      friction={2}
      rightThreshold={40}
      leftThreshold={40}
      renderRightActions={(_p, _t, methods) => (
        <View style={styles.actions}>
          {action(methods, 'pencil-outline', t('common.edit'), theme.colors.primary, onEdit)}
          {action(methods, 'delete-outline', t('common.delete'), theme.colors.error, onDelete)}
        </View>
      )}
      renderLeftActions={
        markPosted
          ? (_p, _t, methods) => (
              <View style={styles.actions}>
                {action(
                  methods,
                  'check-circle-outline',
                  t('transactions.markPosted'),
                  statusColors(theme).success,
                  markPosted,
                )}
              </View>
            )
          : undefined
      }>
      <TouchableRipple
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint={t('transactions.actionsHint')}
        accessibilityActions={a11yActions}
        onAccessibilityAction={onAccessibilityAction}
        style={{ backgroundColor: theme.colors.elevation.level1 }}>
        <View style={styles.row}>
          <View>
            <View style={[styles.icon, { backgroundColor: theme.colors.surfaceVariant }]}>
              <Icon
                source={tx.transferGroupId ? 'swap-horizontal' : (category?.icon ?? 'tag-outline')}
                size={22}
                color={theme.colors.onSurface}
              />
            </View>
            {/* Which card, in cross-account lists: a dot in the card's colour on the tile. */}
            {account ? (
              <View
                style={[
                  styles.accountDot,
                  { backgroundColor: account.color, borderColor: theme.colors.elevation.level1 },
                ]}
              />
            ) : null}
          </View>
          <View style={styles.main}>
            <Text
              variant="titleMedium"
              numberOfLines={1}
              style={[styles.payee, isVoid && styles.strike]}>
              {tx.payee}
            </Text>
            <Text
              variant="bodySmall"
              numberOfLines={1}
              style={{ color: theme.colors.onSurfaceVariant }}>
              {subtitle}
            </Text>
          </View>
          <View style={styles.right}>
            <Text
              variant="titleMedium"
              style={[styles.amount, { color: amountColor }, isVoid && styles.strike]}>
              {amount}
            </Text>
            {statusLabel ? (
              <Text
                variant="labelSmall"
                style={[
                  styles.badge,
                  {
                    color: pending
                      ? theme.colors.onPrimaryContainer
                      : theme.colors.onSurfaceVariant,
                    backgroundColor: pending
                      ? theme.colors.primaryContainer
                      : theme.colors.surfaceVariant,
                  },
                ]}>
                {statusLabel}
              </Text>
            ) : balance ? (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {balance}
              </Text>
            ) : null}
          </View>
        </View>
      </TouchableRipple>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 68,
  },
  icon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  accountDot: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
  },
  payee: { fontWeight: '600' },
  amount: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  main: { flex: 1, gap: 2 },
  right: { alignItems: 'flex-end', gap: 2, maxWidth: '45%' },
  strike: { textDecorationLine: 'line-through' },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  actions: { flexDirection: 'row' },
  action: { width: ACTION_WIDTH, justifyContent: 'center' },
  actionContent: { alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  actionLabel: { color: '#FFFFFF' },
});
