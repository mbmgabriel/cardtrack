import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { MonthColumns } from '@/components/month-columns';
import { MultiSelectDialog } from '@/components/multi-select-dialog';
import { PageHeader, Panel, Pill } from '@/components/page-kit';
import { RankedBars, type RankedBar } from '@/components/ranked-bars';
import { SPENDING_TYPES } from '@/domain/dashboard';
import { parseISODate, todayISO } from '@/domain/dates';
import { formatCents } from '@/domain/money';
import {
  biggestChanges,
  comparisonRanges,
  foldTail,
  monthlyAverage,
  withChanges,
  type Ranked,
} from '@/domain/reports';
import { categoryLabel } from '@/features/categories/category-label';
import { useCategoryMap } from '@/features/categories/use-categories';
import { useDockInset } from '@/features/navigation/dock-tab-bar';
import { NetWorthCard, SafeToSpendCard } from '@/features/reports/position-cards';
import { SectionHeading } from '@/features/reports/section-heading';
import { usePosition } from '@/features/reports/use-position';
import { useReport } from '@/features/reports/use-report';
import { presetRange, type DatePreset } from '@/features/transactions/activity-filters';
import { useAccountMap } from '@/features/transactions/use-transactions';
import { useLocale } from '@/i18n/use-locale';
import { statusColors } from '@/theme';

const PRESETS = ['thisMonth', 'lastMonth', 'last90', 'thisYear', 'all'] as const;
/** Categories and accounts shown before folding the rest into "Other". */
const SHOWN = 6;
const PAYEES_SHOWN = 5;

/** Open Activity with these filters; `at` makes the same link re-apply after manual changes. */
function openFilteredActivity(params: Record<string, string>) {
  router.navigate({ pathname: '/activity', params: { ...params, at: String(Date.now()) } });
}

/**
 * Reports, as three questions with their answers up top:
 * 1. Where do I stand? (today: net worth, safe to spend)
 * 2. Where did my money go? (a chosen period, compared with the one before)
 * 3. How is it trending? (month by month, against the average)
 * The period picker belongs to section 2 only, so it never changes numbers it doesn't apply to.
 */
export default function ReportsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const today = todayISO();
  const dockInset = useDockInset();
  const accounts = useAccountMap();
  const categories = useCategoryMap();
  const position = usePosition(today);
  const currencies = [...new Set([...accounts.values()].map((a) => a.currency))].sort();
  const [preset, setPreset] = useState<Exclude<DatePreset, 'custom'>>('thisMonth');
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [currencyChoice, setCurrency] = useState<string | null>(null);
  const [pickingAccounts, setPickingAccounts] = useState(false);
  const currency =
    currencyChoice && currencies.includes(currencyChoice)
      ? currencyChoice
      : (currencies[0] ?? 'CAD');
  const range = presetRange(preset, today);
  const comparison = comparisonRanges(range, today);
  const report = useReport({
    currency,
    accountIds,
    ...range,
    monthsEnd: range.to && range.to < today ? range.to : today,
    previous: comparison?.previous,
  });

  if (accounts.size === 0) {
    return <EmptyState icon="chart-box-outline" message={t('empty.reports')} />;
  }

  const money = (cents: number) => formatCents(cents, currency, locale);
  const change = (cents: number) =>
    `${cents > 0 ? '+' : '−'}${formatCents(Math.abs(cents), currency, locale)}`;
  const muted = { color: theme.colors.onSurfaceVariant };
  const status = statusColors(theme);
  const shortDate = (iso: string) =>
    new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(parseISODate(iso));
  const percent = (ratio: number) =>
    new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(ratio);
  const inCurrency = [...accounts.values()].filter((a) => a.currency === currency);
  const worth = position.netWorth.find((w) => w.currency === currency);
  const safe = position.safeToSpend.find((s) => s.currency === currency);
  const categoryName = (id: string | null) => {
    const category = id ? categories.get(id) : undefined;
    return category ? categoryLabel(category, t) : t('transactions.uncategorized');
  };

  const openActivity = (params: Record<string, string>) =>
    openFilteredActivity({
      preset,
      types: SPENDING_TYPES.join(','),
      ...(accountIds.length > 0 ? { accountIds: accountIds.join(',') } : {}),
      ...params,
    });

  // 1. Where you stand.
  const standAnswer = worth
    ? worth.netCents >= 0
      ? t('reports.standAhead', { amount: money(worth.netCents) })
      : t('reports.standBehind', { amount: money(-worth.netCents) })
    : undefined;

  // 2. Where it went.
  const previous = report?.previous ?? null;
  const total = report?.total ?? 0;
  const previousPeriod = comparison
    ? `${shortDate(comparison.previous.from)} – ${shortDate(comparison.previous.to)}`
    : '';
  const spendAnswer = !report
    ? undefined
    : !comparison
      ? t('reports.spendAllTime', { amount: money(total) })
      : !previous || previous.total === 0
        ? t('reports.spendNoCompare', { amount: money(total) })
        : total === previous.total
          ? t('reports.spendSame', { period: previousPeriod })
          : t(total > previous.total ? 'reports.spendUp' : 'reports.spendDown', {
              percent: percent(Math.abs(total - previous.total) / previous.total),
              period: previousPeriod,
            });
  const moves =
    report && previous ? biggestChanges(report.byCategory, previous.byCategory, { limit: 3 }) : [];

  const bars = <K,>(
    ranked: readonly Ranked<K>[],
    before: readonly Ranked<K>[] | null,
    describe: (key: K) => { label: string; icon?: string; onPress?: () => void },
  ): RankedBar[] => {
    const changes = before ? new Map(withChanges(ranked, before).map((r) => [r.key, r])) : null;
    const { shown, other } = foldTail(ranked, SHOWN);
    const max = ranked[0]?.cents ?? 1;
    const result: RankedBar[] = shown.map((r) => {
      const delta = changes?.get(r.key)?.changeCents;
      return {
        key: String(r.key),
        value: money(r.cents),
        share: r.share,
        ratio: r.cents / max,
        // How this row moved since the previous period.
        detail:
          delta == null
            ? undefined
            : delta === r.cents
              ? t('reports.newThisPeriod')
              : delta === 0
                ? t('reports.noChange')
                : t('reports.vsBefore', { amount: change(delta) }),
        ...describe(r.key),
      };
    });
    if (other) {
      result.push({
        key: '__other',
        label: t('reports.other', { count: other.count }),
        value: money(other.cents),
        share: other.share,
        ratio: other.cents / max,
        icon: 'dots-horizontal',
      });
    }
    return result;
  };

  // 3. Trend.
  const average = report ? monthlyAverage(report.months) : null;
  const latest = report?.months.at(-1);
  const latestName = latest
    ? new Intl.DateTimeFormat(locale, { month: 'long' }).format(parseISODate(`${latest.month}-01`))
    : '';
  const trendAnswer =
    average == null
      ? t('reports.trendNoAverage')
      : t('reports.trendAverage', { amount: money(average) });

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: dockInset }]}>
        <PageHeader title={t('tabs.reports')} subtitle={t('reports.subtitle')} />

        {currencies.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.bleed}
            contentContainerStyle={styles.pills}>
            {currencies.map((c) => (
              <Pill
                key={c}
                label={c}
                selected={c === currency}
                onPress={() => {
                  setCurrency(c);
                  setAccountIds([]);
                }}
              />
            ))}
          </ScrollView>
        ) : null}

        {/* 1. Where you stand: as of today, not affected by the period below. */}
        <SectionHeading step={1} title={t('reports.standTitle')} answer={standAnswer} />
        {worth ? <NetWorthCard worth={worth} locale={locale} /> : null}
        {safe ? <SafeToSpendCard safe={safe} locale={locale} /> : null}

        {/* 2. Where your money went: for the period picked here. */}
        <SectionHeading step={2} title={t('reports.spendTitle')} answer={spendAnswer} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.bleed}
          contentContainerStyle={styles.pills}
          accessibilityLabel={t('reports.range')}>
          {PRESETS.map((p) => (
            <Pill
              key={p}
              label={t(`activity.datePresets.${p}`)}
              selected={preset === p}
              onPress={() => setPreset(p)}
            />
          ))}
          <Pill
            label={
              accountIds.length > 0
                ? t('activity.filters.selected', {
                    label: t('reports.accounts'),
                    count: accountIds.length,
                  })
                : t('reports.allAccounts')
            }
            icon="filter-outline"
            selected={accountIds.length > 0}
            onPress={() => setPickingAccounts(true)}
          />
        </ScrollView>

        <Panel>
          <Text variant="titleSmall" style={styles.bold}>
            {t('reports.spent')}
          </Text>
          <Text
            style={[styles.total, { color: theme.colors.onSurface }]}
            numberOfLines={1}
            adjustsFontSizeToFit>
            {money(total)}
          </Text>
          {previous && previous.total > 0 ? (
            <Text variant="bodyMedium" style={muted}>
              {t('reports.previousTotal', {
                period: previousPeriod,
                amount: money(previous.total),
              })}
            </Text>
          ) : null}
          {moves.length > 0 ? (
            <View style={styles.moves}>
              {moves.map((m) => {
                const up = m.changeCents > 0;
                return (
                  <View
                    key={String(m.key)}
                    style={[
                      styles.move,
                      {
                        backgroundColor: up
                          ? theme.colors.surfaceVariant
                          : theme.colors.primaryContainer,
                      },
                    ]}>
                    <Text
                      variant="labelLarge"
                      style={{
                        color: up ? theme.colors.onSurface : theme.colors.onPrimaryContainer,
                      }}>
                      {t(up ? 'reports.moveUp' : 'reports.moveDown', {
                        name: categoryName(m.key),
                        amount: formatCents(Math.abs(m.changeCents), currency, locale),
                      })}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}
          <Text variant="bodySmall" style={muted}>
            {t('reports.spentHelp')}
          </Text>
        </Panel>

        {!report || report.byCategory.length === 0 ? (
          <Text variant="bodyMedium" style={[styles.empty, muted]}>
            {t('reports.noSpending')}
          </Text>
        ) : (
          <>
            <Panel title={t('reports.byCategory')}>
              <RankedBars
                locale={locale}
                rows={bars(report.byCategory, previous?.byCategory ?? null, (id) => ({
                  label: categoryName(id),
                  icon: (id ? categories.get(id)?.icon : undefined) ?? 'tag-off-outline',
                  onPress: id ? () => openActivity({ categoryIds: id }) : undefined,
                }))}
              />
            </Panel>

            {report.byAccount.length > 1 ? (
              <Panel title={t('reports.byAccount')}>
                <RankedBars
                  locale={locale}
                  rows={bars(report.byAccount, previous?.byAccount ?? null, (id) => ({
                    label: accounts.get(id)?.name ?? id,
                    icon: 'credit-card-outline',
                    onPress: () => openActivity({ accountIds: id }),
                  }))}
                />
              </Panel>
            ) : null}

            <Panel title={t('reports.topPayees')}>
              <RankedBars
                locale={locale}
                rows={report.payees.slice(0, PAYEES_SHOWN).map((p) => ({
                  key: p.key,
                  label: p.payee,
                  value: money(p.cents),
                  share: p.share,
                  ratio: p.cents / (report.payees[0]?.cents || 1),
                  detail: t('reports.visits', { count: p.count }),
                  onPress: () => openActivity({ text: p.payee }),
                }))}
              />
            </Panel>
          </>
        )}

        {/* 3. How it's trending: the last 12 months. */}
        <SectionHeading step={3} title={t('reports.trendTitle')} answer={trendAnswer} />
        {report ? (
          <Panel
            title={t('reports.byMonth')}
            trailing={
              latest
                ? t('reports.latestVsAverage', { month: latestName, amount: money(latest.cents) })
                : undefined
            }>
            <MonthColumns months={report.months} format={money} locale={locale} />
            {latest && average != null && average > 0 ? (
              <Text
                variant="bodyMedium"
                style={{
                  color: latest.cents > average ? theme.colors.onSurface : status.success,
                }}>
                {latest.cents > average
                  ? t('reports.aboveAverage', {
                      month: latestName,
                      percent: percent((latest.cents - average) / average),
                    })
                  : t('reports.withinAverage', { month: latestName })}
              </Text>
            ) : null}
          </Panel>
        ) : null}
      </ScrollView>

      <MultiSelectDialog
        visible={pickingAccounts}
        title={t('reports.accounts')}
        options={inCurrency.map((a) => ({ value: a.id, label: a.name }))}
        selected={accountIds}
        onDismiss={() => setPickingAccounts(false)}
        onApply={(ids) => {
          setAccountIds(ids);
          setPickingAccounts(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16, paddingTop: 8, gap: 14 },
  bleed: { marginHorizontal: -16 },
  pills: { gap: 8, paddingHorizontal: 16 },
  bold: { fontWeight: '700' },
  total: { fontSize: 40, lineHeight: 48, fontWeight: '800', letterSpacing: -1.5 },
  moves: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  move: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  empty: { textAlign: 'center', padding: 24 },
});
