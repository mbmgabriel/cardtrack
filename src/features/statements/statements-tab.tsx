import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Button, List, Text, useTheme } from 'react-native-paper';

import type { Account } from '@/db/schema';
import { parseISODate, todayISO } from '@/domain/dates';
import { formatCents } from '@/domain/money';
import { isLiabilityAccount } from '@/domain/types';
import { useLocale } from '@/i18n/use-locale';

import { StatusBadge } from './status-badge';
import { useAccountStatements } from './use-statements';

/** Account detail → Statements: one row per cycle, newest first. */
export function StatementsTab({
  account,
  emptyMessage,
}: {
  account: Account;
  emptyMessage: string;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const items = useAccountStatements(account.id, todayISO());
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(parseISODate(iso));
  const muted = { color: theme.colors.onSurfaceVariant };

  if (!isLiabilityAccount(account.type) || account.statementDay == null) {
    return (
      <View style={styles.empty}>
        <Text variant="bodyMedium" style={[styles.center, muted]}>
          {t('accountDetail.statementsNeedDay')}
        </Text>
        {isLiabilityAccount(account.type) ? (
          <Button
            mode="outlined"
            icon="pencil-outline"
            onPress={() =>
              router.push({ pathname: '/account/[id]/edit', params: { id: account.id } })
            }
            contentStyle={styles.button}>
            {t('accounts.edit')}
          </Button>
        ) : null}
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <Text variant="bodyMedium" style={[styles.center, styles.empty, muted]}>
        {emptyMessage}
      </Text>
    );
  }

  return (
    <View>
      {items.map(({ statement, summary }) => {
        const period = t('statements.period', {
          start: date(statement.periodStart),
          end: date(statement.periodEnd),
        });
        const description = [
          t('statements.due', { date: date(statement.dueDate) }),
          t('statements.balance', {
            amount: formatCents(summary.balanceDueCents, account.currency, locale),
          }),
        ].join(' · ');
        return (
          <List.Item
            key={statement.id}
            title={period}
            description={description}
            onPress={() =>
              router.push({ pathname: '/statement/[id]', params: { id: statement.id } })
            }
            accessibilityRole="button"
            accessibilityLabel={`${period}, ${t(`statementStatuses.${summary.status}`)}, ${description}`}
            left={(props) => <List.Icon {...props} icon="file-document-outline" />}
            right={() => <StatusBadge status={summary.status} />}
            style={styles.item}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { padding: 24, gap: 12, alignItems: 'center' },
  center: { textAlign: 'center' },
  button: { minHeight: 44 },
  item: { minHeight: 56 },
});
