import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Dialog, Portal, RadioButton, Searchbar, Text, useTheme } from 'react-native-paper';

import { DateField } from '@/components/date-field';
import { GroupedSeparator, groupedRow, PageHeader, Pill } from '@/components/page-kit';
import { EmptyState } from '@/components/empty-state';
import { MultiSelectDialog } from '@/components/multi-select-dialog';
import { repos } from '@/db';
import { parseISODate, todayISO } from '@/domain/dates';
import { groupByDate } from '@/domain/transactions';
import { TRANSACTION_STATUSES, TRANSACTION_TYPES } from '@/domain/types';
import { categoryLabel } from '@/features/categories/category-label';
import { useCategories } from '@/features/categories/use-categories';
import { shareTextFile } from '@/features/export/share-file';
import { transactionsToCsv } from '@/features/export/transactions-csv';
import {
  activeFilterCount,
  DATE_PRESETS,
  emptyActivityFilters,
  filtersFromParams,
  toTransactionFilters,
  type ActivityFilterState,
  type ActivityParams,
  type DatePreset,
} from '@/features/transactions/activity-filters';
import { useTransactionActions } from '@/features/transactions/transaction-actions';
import { TransactionRow } from '@/features/transactions/transaction-row';
import { useAccountMap, useTransactionSearch } from '@/features/transactions/use-transactions';
import { useDockInset } from '@/features/navigation/dock-tab-bar';
import { useLocale } from '@/i18n/use-locale';

/** Rows shown at once; Phase 10 moves this list to FlashList for very large histories. */
const RESULT_LIMIT = 500;

type OpenDialog = 'account' | 'category' | 'type' | 'status' | 'dates' | null;

export default function ActivityScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const today = todayISO();
  const dockInset = useDockInset();
  const params = useLocalSearchParams<ActivityParams>();
  const paramsKey = JSON.stringify(params);
  const [appliedParams, setAppliedParams] = useState(paramsKey);
  const [filters, setFilters] = useState<ActivityFilterState>(
    () => filtersFromParams(params, today) ?? emptyActivityFilters(today),
  );
  // Opened again from a dashboard widget: apply that widget's filters.
  if (paramsKey !== appliedParams) {
    setAppliedParams(paramsKey);
    setFilters(filtersFromParams(params, today) ?? emptyActivityFilters(today));
  }
  const [open, setOpen] = useState<OpenDialog>(null);
  const [datesDraft, setDatesDraft] = useState(filters);
  const accounts = useAccountMap();
  const categories = useCategories();
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const results = useTransactionSearch(
    toTransactionFilters(filters, { locale, today, limit: RESULT_LIMIT }),
  );
  const { actionsFor, dialogs } = useTransactionActions();

  /** Every transaction matching the current filters (not just the rows on screen). */
  const exportCsv = async () => {
    const rows = repos.transactions.search(
      toTransactionFilters(filters, { locale, today, limit: Number.MAX_SAFE_INTEGER }),
    );
    const csv = transactionsToCsv(rows, {
      accounts,
      categories: categoryMap,
      labels: {
        headers: {
          date: t('exportCsv.date'),
          account: t('exportCsv.account'),
          payee: t('exportCsv.payee'),
          amount: t('exportCsv.amount'),
          currency: t('exportCsv.currency'),
          type: t('exportCsv.type'),
          status: t('exportCsv.status'),
          category: t('exportCsv.category'),
          notes: t('exportCsv.notes'),
        },
        type: (type) => t(`transactionTypes.${type}`),
        status: (status) => t(`transactionStatuses.${status}`),
        category: (category) => categoryLabel(category, t),
      },
    });
    try {
      const shared = await shareTextFile(`cardtrack-transactions-${today}.csv`, csv, {
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
      });
      if (!shared) Alert.alert(t('exportCsv.title'), t('exportCsv.unavailable'));
    } catch (e) {
      Alert.alert(t('exportCsv.title'), e instanceof Error ? e.message : String(e));
    }
  };

  const update = (patch: Partial<ActivityFilterState>) => setFilters((f) => ({ ...f, ...patch }));
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(parseISODate(iso));
  if (accounts.size === 0) {
    return <EmptyState icon="format-list-bulleted" message={t('empty.activity')} />;
  }

  const filterChip = (key: Exclude<OpenDialog, null>, count: number) => {
    const label = t(`activity.filters.${key}`);
    const active = count > 0;
    return (
      <Pill
        key={key}
        selected={active}
        icon={active ? 'filter' : 'filter-outline'}
        onPress={() => {
          if (key === 'dates') setDatesDraft(filters);
          setOpen(key);
        }}
        label={
          key === 'dates' && filters.datePreset !== 'all'
            ? t(`activity.datePresets.${filters.datePreset}`)
            : active && key !== 'dates'
              ? t('activity.filters.selected', { label, count })
              : label
        }
      />
    );
  };

  const header = (
    <View style={styles.header}>
      <PageHeader
        title={t('tabs.activity')}
        actions={[
          {
            icon: 'export-variant',
            label: t('exportCsv.button'),
            onPress: () => {
              if (results.length > 0) void exportCsv();
            },
          },
        ]}
      />
      <Searchbar
        placeholder={t('activity.search')}
        accessibilityLabel={t('activity.search')}
        value={filters.text}
        onChangeText={(text) => update({ text })}
        autoCorrect={false}
        elevation={0}
        style={[
          styles.search,
          {
            backgroundColor: theme.colors.elevation.level1,
            borderColor: theme.colors.outlineVariant,
          },
        ]}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.bleed}
        contentContainerStyle={styles.chips}>
        {filterChip('account', filters.accountIds.length)}
        {filterChip('category', filters.categoryIds.length)}
        {filterChip('type', filters.types.length)}
        {filterChip('status', filters.statuses.length)}
        {filterChip('dates', filters.datePreset === 'all' ? 0 : 1)}
        {activeFilterCount(filters) > 0 ? (
          <Pill
            icon="close"
            label={t('activity.filters.clearAll')}
            onPress={() => setFilters({ ...emptyActivityFilters(today), text: filters.text })}
          />
        ) : null}
      </ScrollView>
      {results.length >= RESULT_LIMIT ? (
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {t('activity.limited', { count: RESULT_LIMIT })}
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <SectionList
        stickySectionHeadersEnabled={false}
        sections={groupByDate(results)}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <Text
            variant="bodyMedium"
            style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>
            {t('activity.noResults')}
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <Text variant="titleSmall" accessibilityRole="header" style={styles.sectionHeader}>
            {date(section.date)}
          </Text>
        )}
        // Each day's rows read as one rounded white panel.
        ItemSeparatorComponent={GroupedSeparator}
        renderItem={({ item, index, section }) => {
          const account = accounts.get(item.accountId);
          return (
            <TransactionRow
              transaction={item}
              currency={account?.currency ?? 'CAD'}
              locale={locale}
              account={account}
              category={item.categoryId ? categoryMap.get(item.categoryId) : undefined}
              style={[
                styles.rowSpacing,
                { borderColor: theme.colors.outlineVariant },
                groupedRow(index, section.data.length),
              ]}
              {...actionsFor(item)}
            />
          );
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: dockInset }}
      />

      <MultiSelectDialog
        visible={open === 'account'}
        title={t('activity.filters.account')}
        options={[...accounts.values()].map((a) => ({ value: a.id, label: a.name }))}
        selected={filters.accountIds}
        onDismiss={() => setOpen(null)}
        onApply={(accountIds) => {
          update({ accountIds });
          setOpen(null);
        }}
      />
      <MultiSelectDialog
        visible={open === 'category'}
        title={t('activity.filters.category')}
        options={categories.map((c) => ({ value: c.id, label: categoryLabel(c, t) }))}
        selected={filters.categoryIds}
        onDismiss={() => setOpen(null)}
        onApply={(categoryIds) => {
          update({ categoryIds });
          setOpen(null);
        }}
      />
      <MultiSelectDialog
        visible={open === 'type'}
        title={t('activity.filters.type')}
        options={TRANSACTION_TYPES.map((v) => ({ value: v, label: t(`transactionTypes.${v}`) }))}
        selected={filters.types}
        onDismiss={() => setOpen(null)}
        onApply={(types) => {
          update({ types });
          setOpen(null);
        }}
      />
      <MultiSelectDialog
        visible={open === 'status'}
        title={t('activity.filters.status')}
        options={TRANSACTION_STATUSES.map((v) => ({
          value: v,
          label: t(`transactionStatuses.${v}`),
        }))}
        selected={filters.statuses}
        onDismiss={() => setOpen(null)}
        onApply={(statuses) => {
          update({ statuses });
          setOpen(null);
        }}
      />
      <Portal>
        <Dialog visible={open === 'dates'} onDismiss={() => setOpen(null)}>
          <Dialog.Title>{t('activity.filters.dates')}</Dialog.Title>
          <Dialog.ScrollArea style={styles.datesArea}>
            <ScrollView contentContainerStyle={styles.datesContent}>
              <RadioButton.Group
                value={datesDraft.datePreset}
                onValueChange={(v) =>
                  setDatesDraft((d) => ({ ...d, datePreset: v as DatePreset }))
                }>
                {DATE_PRESETS.map((p) => (
                  <RadioButton.Item
                    key={p}
                    value={p}
                    label={t(`activity.datePresets.${p}`)}
                    mode="android"
                    position="leading"
                    labelStyle={styles.radioLabel}
                  />
                ))}
              </RadioButton.Group>
              {datesDraft.datePreset === 'custom' ? (
                <View style={styles.custom}>
                  <DateField
                    label={t('activity.filters.from')}
                    value={datesDraft.from}
                    onChange={(from) => setDatesDraft((d) => ({ ...d, from }))}
                  />
                  <DateField
                    label={t('activity.filters.to')}
                    value={datesDraft.to}
                    onChange={(to) => setDatesDraft((d) => ({ ...d, to }))}
                  />
                </View>
              ) : null}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setOpen(null)}>{t('common.cancel')}</Button>
            <Button
              onPress={() => {
                update({
                  datePreset: datesDraft.datePreset,
                  from: datesDraft.from,
                  to: datesDraft.to,
                });
                setOpen(null);
              }}>
              {t('common.apply')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      {dialogs}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { padding: 16, paddingTop: 8, gap: 14 },
  search: { borderRadius: 20, borderWidth: 1 },
  bleed: { marginHorizontal: -16 },
  chips: { gap: 8, paddingHorizontal: 16 },
  sectionHeader: { fontWeight: '700', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  rowSpacing: { marginHorizontal: 16 },
  empty: { textAlign: 'center', padding: 24 },
  datesArea: { maxHeight: 480, paddingHorizontal: 0 },
  datesContent: { paddingBottom: 8 },
  radioLabel: { textAlign: 'left' },
  custom: { paddingHorizontal: 24, gap: 12, paddingTop: 8 },
});
