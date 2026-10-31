import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Button, Icon, List, Text, useTheme } from 'react-native-paper';

import { repos } from '@/db';
import type { Transaction } from '@/db/schema';
import { parseISODate, todayISO } from '@/domain/dates';
import { formatCents } from '@/domain/money';
import { detectRecurring, suggestionKey, type RecurringSuggestion } from '@/domain/recurrence';
import { formatSignedCents } from '@/features/transactions/transaction-row';
import { useLocale } from '@/i18n/use-locale';

import { frequencyLabel } from './labels';
import { useAccountRules, useDismissedSuggestions } from './use-recurring';

type Props = {
  accountId: string;
  currency: string;
  /** The account's transactions, used to spot charges that look recurring. */
  transactions: readonly Transaction[];
  emptyMessage: string;
};

/** Account detail → Recurring: suggestions, then the account's rules. */
export function RecurringTab({ accountId, currency, transactions, emptyMessage }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const rules = useAccountRules(accountId);
  const dismissed = useDismissedSuggestions();
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(parseISODate(iso));

  const suggestions = detectRecurring(transactions, {
    today: todayISO(),
    ruleKeys: new Set(rules.map((r) => suggestionKey(r.accountId, r.payee))),
    dismissed: new Set(dismissed),
  });

  const dismiss = (s: RecurringSuggestion) =>
    repos.settings.set('recurring_dismissed', [...dismissed, s.key]);

  const createFrom = (s: RecurringSuggestion) =>
    router.push({
      pathname: '/recurring/new',
      params: {
        accountId,
        payee: s.payee,
        amountCents: String(s.amountCents),
        anchorDate: s.anchorDate,
        categoryId: s.categoryId ?? '',
      },
    });

  return (
    <View style={styles.container}>
      {suggestions.map((s) => (
        <View
          key={s.key}
          style={[styles.suggestion, { backgroundColor: theme.colors.secondaryContainer }]}>
          <View style={styles.suggestionText} accessible accessibilityRole="text">
            <Icon
              source="lightbulb-on-outline"
              size={20}
              color={theme.colors.onSecondaryContainer}
            />
            <View style={styles.flex}>
              <Text variant="titleSmall" style={{ color: theme.colors.onSecondaryContainer }}>
                {t('recurring.suggestionTitle')}
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSecondaryContainer }}>
                {t('recurring.suggestionBody', {
                  payee: s.payee,
                  amount: formatCents(Math.abs(s.amountCents), currency, locale),
                  count: s.months,
                })}
              </Text>
            </View>
          </View>
          <View style={styles.suggestionActions}>
            <Button onPress={() => dismiss(s)} contentStyle={styles.button}>
              {t('recurring.dismiss')}
            </Button>
            <Button mode="contained" onPress={() => createFrom(s)} contentStyle={styles.button}>
              {t('recurring.createRule')}
            </Button>
          </View>
        </View>
      ))}

      {rules.length === 0 ? (
        <Text variant="bodyMedium" style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>
          {emptyMessage}
        </Text>
      ) : (
        rules.map((rule) => {
          const status = !rule.isActive
            ? t('recurring.paused')
            : rule.autoCreate
              ? t('recurring.autoAdd')
              : t('recurring.reminderOnly');
          const description = [
            frequencyLabel(rule, t),
            rule.isActive ? t('recurring.next', { date: date(rule.nextDate) }) : null,
            status,
          ]
            .filter(Boolean)
            .join(' · ');
          const amount = formatSignedCents(rule.amountCents, currency, locale);
          return (
            <List.Item
              key={rule.id}
              title={rule.payee}
              description={description}
              descriptionNumberOfLines={2}
              onPress={() => router.push({ pathname: '/recurring/[id]', params: { id: rule.id } })}
              accessibilityRole="button"
              accessibilityLabel={`${rule.payee}, ${amount}, ${description}`}
              style={[styles.item, !rule.isActive && styles.paused]}
              left={(props) => (
                <List.Icon {...props} icon={rule.isActive ? 'autorenew' : 'pause-circle-outline'} />
              )}
              right={() => (
                <Text variant="bodyLarge" style={styles.amount}>
                  {amount}
                </Text>
              )}
            />
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { gap: 8 },
  suggestion: { borderRadius: 12, padding: 12, gap: 8 },
  suggestionText: { flexDirection: 'row', gap: 8 },
  suggestionActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  button: { minHeight: 44 },
  empty: { textAlign: 'center', padding: 24 },
  item: { minHeight: 56 },
  paused: { opacity: 0.6 },
  amount: { alignSelf: 'center' },
});
