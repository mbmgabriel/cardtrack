import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { Button, IconButton, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import {
  GroupedSeparator,
  groupedRow,
  ListRow,
  Panel,
  Pill,
  RoundButton,
  RowDivider,
} from '@/components/page-kit';
import { repos } from '@/db';
import {
  openingBalanceForDisplay,
  postedBalanceCents,
  totalsFromTransactions,
} from '@/domain/balances';
import { DEFAULT_DUE_DAY_OFFSET, nextDueDate, parseISODate, todayISO } from '@/domain/dates';
import { formatCents } from '@/domain/money';
import { formatBps } from '@/domain/rates';
import { groupByDate, runningBalances } from '@/domain/transactions';
import { AccountTile } from '@/features/accounts/account-tile';
import { InstallmentsTab } from '@/features/installments/installments-tab';
import { RecurringTab } from '@/features/recurring/recurring-tab';
import { StatementsTab } from '@/features/statements/statements-tab';
import { useAccount } from '@/features/accounts/use-accounts';
import { useCategoryMap } from '@/features/categories/use-categories';
import { useTransactionActions } from '@/features/transactions/transaction-actions';
import { TransactionRow } from '@/features/transactions/transaction-row';
import { useAccountTransactions } from '@/features/transactions/use-transactions';
import { useLocale } from '@/i18n/use-locale';

const TABS = ['transactions', 'pending', 'installments', 'recurring', 'statements'] as const;
type Tab = (typeof TABS)[number];

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const current = useAccount(id);
  const rows = useAccountTransactions(id);
  const categories = useCategoryMap();
  const { actionsFor, dialogs, requestMarkPosted } = useTransactionActions();
  const [tab, setTab] = useState<Tab>('transactions');

  if (!current)
    return <EmptyState icon="credit-card-off-outline" message={t('accounts.notFound')} />;
  const { account, summary } = current;
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(parseISODate(iso));
  const due =
    summary.isLiability && account.statementDay != null
      ? nextDueDate(
          todayISO(),
          account.statementDay,
          account.dueDayOffset ?? DEFAULT_DUE_DAY_OFFSET,
        )
      : null;

  const pending = rows.filter((r) => r.status === 'pending');
  const balances = runningBalances(
    rows,
    postedBalanceCents(account, totalsFromTransactions(rows, account.openingBalanceDate)),
    account.openingBalanceDate,
  );
  const sections = groupByDate(tab === 'transactions' ? rows : tab === 'pending' ? pending : []);
  const tabLabel = (key: Tab) =>
    key === 'pending' && pending.length > 0
      ? t('accountDetail.pendingCount', { count: pending.length })
      : t(`accountDetail.tabs.${key}`);
  const emptyMessage = {
    transactions: t('accountDetail.noTransactions'),
    pending: t('accountDetail.noPending'),
    recurring: t('accountDetail.noRecurring'),
    statements: t('accountDetail.noStatements'),
    installments: '',
  }[tab];
  // Instalment plans only exist on cards and lines of credit.
  const tabs = TABS.filter(
    (key) =>
      key !== 'installments' || account.type === 'credit' || account.type === 'line_of_credit',
  );

  const facts: { title: string; description?: string; value: string; onPress?: () => void }[] = [
    {
      title: t('accountDetail.openingBalance'),
      description: t('accountDetail.asOf', { date: date(account.openingBalanceDate) }),
      value: formatCents(
        openingBalanceForDisplay(account.type, account.openingBalanceCents),
        account.currency,
        locale,
      ),
    },
    ...(account.creditLimitCents != null
      ? [
          {
            title: t('accountForm.creditLimit'),
            value: formatCents(account.creditLimitCents, account.currency, locale),
          },
        ]
      : []),
    ...(summary.pendingHoldsCents !== 0
      ? [
          {
            title: t('accountDetail.pendingHolds'),
            value: formatCents(summary.pendingHoldsCents, account.currency, locale),
            onPress: () => setTab('pending'),
          },
        ]
      : []),
    ...(due
      ? [
          {
            title: t('accountDetail.nextDue'),
            description: t('accountDetail.statementCloses', {
              day: account.statementDay,
              date: date(due.period.end),
            }),
            value: date(due.dueDate),
          },
        ]
      : []),
    ...(account.interestRateBps != null
      ? [
          {
            title: t('accountForm.interestRate'),
            value: formatBps(account.interestRateBps, locale),
          },
        ]
      : []),
  ];

  const header = (
    <View style={styles.header}>
      <AccountTile account={account} summary={summary} locale={locale} />

      <Panel padded={false}>
        {facts.map((fact, i) => (
          <View key={fact.title}>
            {i > 0 ? <RowDivider flush /> : null}
            <ListRow {...fact} />
          </View>
        ))}
      </Panel>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        contentContainerStyle={styles.tabs}>
        {tabs.map((key) => (
          <Pill
            key={key}
            selected={tab === key}
            onPress={() => setTab(key)}
            label={tabLabel(key)}
          />
        ))}
      </ScrollView>
      {tab === 'recurring' ? (
        <RecurringTab
          accountId={id}
          currency={account.currency}
          transactions={rows}
          emptyMessage={emptyMessage}
        />
      ) : null}
      {tab === 'statements' ? (
        <StatementsTab account={account} emptyMessage={emptyMessage} />
      ) : null}
      {tab === 'installments' ? (
        <InstallmentsTab accountId={id} currency={account.currency} />
      ) : null}
      {tab === 'pending' && pending.length > 0 ? (
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {t('accountDetail.pendingTotal', {
            amount: formatCents(summary.pendingHoldsCents, account.currency, locale),
          })}
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.flex}>
      <Stack.Screen
        options={{
          title: account.name,
          headerRight: () => (
            <View style={styles.headerActions}>
              <IconButton
                icon="file-upload-outline"
                accessibilityLabel={t('import.open')}
                onPress={() =>
                  router.push({ pathname: '/import/[accountId]', params: { accountId: id } })
                }
              />
              <IconButton
                icon="pencil-outline"
                accessibilityLabel={t('accounts.edit')}
                onPress={() => router.push({ pathname: '/account/[id]/edit', params: { id } })}
              />
            </View>
          ),
        }}
      />
      <SectionList
        contentInsetAdjustmentBehavior="automatic"
        sections={sections}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          // The Recurring and Statements tabs render their own content in the header.
          tab === 'recurring' || tab === 'statements' || tab === 'installments' ? undefined : (
            <Text
              variant="bodyMedium"
              style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>
              {emptyMessage}
            </Text>
          )
        }
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text variant="titleSmall" accessibilityRole="header" style={styles.sectionHeader}>
            {date(section.date)}
          </Text>
        )}
        ItemSeparatorComponent={GroupedSeparator}
        renderItem={({ item, index, section }) => (
          <View
            style={[
              styles.rowGroup,
              {
                backgroundColor: theme.colors.elevation.level1,
                borderColor: theme.colors.outlineVariant,
              },
              groupedRow(index, section.data.length),
            ]}>
            <TransactionRow
              transaction={item}
              currency={account.currency}
              locale={locale}
              category={item.categoryId ? categories.get(item.categoryId) : undefined}
              runningBalanceCents={balances.get(item.id)}
              isLiability={summary.isLiability}
              {...actionsFor(item)}
            />
            {tab === 'pending' ? (
              <View style={styles.pendingActions}>
                <Button
                  icon="check-circle-outline"
                  onPress={() => requestMarkPosted(item)}
                  contentStyle={styles.button}>
                  {t('transactions.markPosted')}
                </Button>
                <Button
                  icon="cancel"
                  onPress={() => repos.transactions.void(item.id)}
                  contentStyle={styles.button}>
                  {t('transactions.void')}
                </Button>
              </View>
            ) : null}
          </View>
        )}
        contentContainerStyle={styles.list}
      />
      {tab !== 'statements' ? (
        <View style={styles.fab}>
          <RoundButton
            primary
            icon="plus"
            label={
              tab === 'recurring'
                ? t('recurring.add')
                : tab === 'installments'
                  ? t('installments.add')
                  : t('transactions.add')
            }
            onPress={() =>
              tab === 'recurring'
                ? router.push({ pathname: '/recurring/new', params: { accountId: id } })
                : tab === 'installments'
                  ? router.push({ pathname: '/installment/new', params: { accountId: id } })
                  : router.push({
                      pathname: '/transaction/new',
                      params:
                        tab === 'pending'
                          ? { accountId: id, status: 'pending' }
                          : { accountId: id },
                    })
            }
          />
        </View>
      ) : null}
      {dialogs}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { padding: 16, gap: 14 },
  list: { paddingBottom: 112 },
  tabs: { gap: 8 },
  sectionHeader: { fontWeight: '700', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  rowGroup: { marginHorizontal: 16 },
  empty: { textAlign: 'center', padding: 24 },
  pendingActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 8 },
  button: { minHeight: 44 },
  fab: { position: 'absolute', right: 20, bottom: 20 },
  headerActions: { flexDirection: 'row' },
});
