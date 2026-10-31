import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  FadeInDown,
  interpolate,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { Button, Icon, Text, TouchableRipple, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { Panel, RoundButton } from '@/components/page-kit';
import { SPENDING_TYPES } from '@/domain/dashboard';
import { parseISODate, todayISO } from '@/domain/dates';
import { formatCents } from '@/domain/money';
import { useCategoryMap } from '@/features/categories/use-categories';
import { CardStack } from '@/features/dashboard/card-stack';
import { ComingUp } from '@/features/dashboard/coming-up';
import type { CurrencySummary, UpcomingDue } from '@/features/dashboard/dashboard-data';
import { setFocusedCard } from '@/features/dashboard/focused-card';
import { BalancePrivacy, MASK } from '@/features/dashboard/privacy';
import { QuickActions } from '@/features/dashboard/quick-actions';
import { RecentActivity } from '@/features/dashboard/recent-activity';
import { SpendingPaceCard } from '@/features/dashboard/spending-pace';
import { setHideBalances, useDashboard } from '@/features/dashboard/use-dashboard';
import { useDockInset } from '@/features/navigation/dock-tab-bar';
import { PayoffSummaryCard } from '@/features/payoff/payoff-summary-card';
import { UtilizationGauge } from '@/features/dashboard/utilization-gauge';
import { useLocale } from '@/i18n/use-locale';

/** How far apart each section's entrance starts, for a short top-to-bottom cascade. */
const CASCADE_MS = 70;

function greetingKey(): 'greetingMorning' | 'greetingAfternoon' | 'greetingEvening' {
  const hour = new Date().getHours();
  return hour < 12 ? 'greetingMorning' : hour < 18 ? 'greetingAfternoon' : 'greetingEvening';
}

function openAccount(id: string) {
  router.push({ pathname: '/account/[id]', params: { id } });
}

/** Log a card payment, pre-filled with the card and what's owed on it. */
function recordPayment(accountId?: string, owedCents?: number) {
  router.push({
    pathname: '/transaction/new',
    params: {
      type: 'payment',
      ...(accountId ? { accountId } : {}),
      ...(owedCents && owedCents > 0 ? { amountCents: String(owedCents) } : {}),
    },
  });
}

/** Open Activity pre-filtered; `at` makes the same link re-apply after manual changes. */
function openActivity(params: Record<string, string>) {
  router.navigate({ pathname: '/activity', params: { ...params, at: String(Date.now()) } });
}

export default function DashboardScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const today = todayISO();
  const { hasAccounts, cards, all, byCard, hideBalances } = useDashboard(today);
  const hidden = Boolean(hideBalances);
  const categories = useCategoryMap();
  const dockInset = useDockInset();

  // The raised card in the wallet; null while every card is in the stack.
  const [raisedId, setRaisedId] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const focused =
    cards.length === 1 ? cards[0] : (cards.find((c) => c.account.id === raisedId) ?? null);
  const view = (focused && byCard.get(focused.account.id)) || all;
  const { timeline, totals, monthlyRecurring, spending, recent } = view;
  // The tab bar's add button adds to this card.
  const focusedId = focused?.account.id ?? null;
  useEffect(() => setFocusedCard(focusedId), [focusedId]);
  const focus = (id: string | null) => {
    setRaisedId(id);
    setChanged(true);
  };

  // The greeting drifts up and fades as the page scrolls under it.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const [comingUpY, setComingUpY] = useState(0);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 60], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [0, 60], [0, -12], Extrapolation.CLAMP) }],
  }));

  if (!hasAccounts) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
        <EmptyState icon="wallet-outline" message={t('empty.home')} />
        <View style={styles.emptyActions}>
          <Button
            mode="contained"
            icon="plus"
            onPress={() => router.push('/account/new')}
            contentStyle={styles.button}>
            {t('dashboard.addFirst')}
          </Button>
        </View>
      </View>
    );
  }

  const muted = { color: theme.colors.onSurfaceVariant };
  const card = { backgroundColor: theme.colors.elevation.level1 };
  const longDate = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(parseISODate(today));
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long' }).format(parseISODate(today));
  const money = (cents: number, currency: string) =>
    hidden ? MASK : formatCents(cents, currency, locale);
  const holds = totals.filter((c) => c.pendingHoldsCents !== 0);
  const enter = (step: number) => FadeInDown.delay(step * CASCADE_MS).duration(450);
  // Sections re-enter when the raised card changes; after the first load that should be quick.
  const refresh = (step: number) => (changed ? FadeInDown.duration(260) : enter(step));
  const focusKey = focused?.account.id ?? 'all';
  // A payment due soon (on any card) lights the bell.
  const dueSoon = all.timeline.some((d) =>
    d.items.some(
      (i) => i.kind === 'due' && (i.due.urgency === 'urgent' || i.due.urgency === 'overdue'),
    ),
  );

  // The headline: what's owed (or held) for the focus, in its first currency.
  const [lead, ...others] = totals as [CurrencySummary, ...CurrencySummary[]];
  const owing = lead.hasLiability;
  const name = focused?.account.name;
  const heroLabel = owing
    ? name
      ? t('dashboard.owedOn', { name })
      : t('dashboard.totalOwed')
    : name
      ? t('dashboard.balanceOn', { name })
      : t('dashboard.totalCash');
  const heroDetails = [
    lead.creditLimitCents > 0
      ? t('accounts.available', { amount: money(lead.availableCreditCents, lead.currency) })
      : null,
    owing && lead.hasCash && !focused
      ? t('dashboard.cashLine', { amount: money(lead.cashCents, lead.currency) })
      : null,
    ...others.map(
      (c) => `${c.currency} · ${money(c.hasLiability ? c.owedCents : c.cashCents, c.currency)}`,
    ),
  ].filter((line): line is string => line != null);
  const payable = focused?.summary.isLiability && focused.summary.balanceCents > 0;
  const actions = [
    {
      key: 'add',
      icon: 'plus',
      label: t('dashboard.actionAdd'),
      onPress: () =>
        router.push({
          pathname: '/transaction/new',
          params: focused ? { accountId: focused.account.id } : {},
        }),
    },
    {
      key: 'pay',
      icon: 'cash-check',
      label: t('dashboard.actionPay'),
      onPress: () =>
        focused && payable
          ? recordPayment(focused.account.id, focused.summary.balanceCents)
          : recordPayment(focused?.account.id),
    },
    {
      key: 'transfer',
      icon: 'swap-horizontal',
      label: t('dashboard.actionTransfer'),
      onPress: () =>
        router.push({
          pathname: '/transaction/new',
          params: { type: 'transfer', ...(focused ? { accountId: focused.account.id } : {}) },
        }),
    },
    {
      key: 'more',
      icon: focused ? 'file-upload-outline' : 'credit-card-plus-outline',
      label: focused ? t('dashboard.actionImport') : t('dashboard.actionNewCard'),
      onPress: () =>
        focused
          ? router.push({
              pathname: '/import/[accountId]',
              params: { accountId: focused.account.id },
            })
          : router.push('/account/new'),
    },
  ];

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <BalancePrivacy value={hidden}>
        <Animated.ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={[styles.container, { paddingBottom: dockInset }]}>
          {/* Entrance on the wrapper, scroll fade inside: one view can't run both. */}
          <Animated.View entering={enter(0)}>
            <Animated.View style={[styles.header, headerStyle]}>
              <View style={styles.flex}>
                <Text variant="headlineSmall" style={styles.greeting}>
                  {t(`dashboard.${greetingKey()}`)}
                </Text>
                <Text variant="bodyMedium" style={muted}>
                  {longDate}
                </Text>
              </View>
              <RoundButton
                icon="bell-outline"
                label={dueSoon ? t('dashboard.alertsDue') : t('dashboard.comingUp')}
                badge={dueSoon}
                onPress={() => scrollRef.current?.scrollTo({ y: comingUpY - 12, animated: true })}
              />
            </Animated.View>
          </Animated.View>

          <Animated.View entering={enter(1)}>
            <CardStack
              items={cards}
              focusedId={raisedId}
              onFocus={focus}
              onOpen={openAccount}
              pocket={{
                label: heroLabel,
                cents: owing ? lead.owedCents : lead.cashCents,
                currency: lead.currency,
                details: heroDetails,
              }}
              hidden={hidden}
              onToggleHidden={() => setHideBalances(!hidden)}
              today={today}
              locale={locale}
            />
          </Animated.View>

          <Animated.View entering={enter(2)}>
            <QuickActions actions={actions} />
          </Animated.View>

          <Animated.View key={`gauge-${focusKey}`} entering={refresh(3)} style={styles.section}>
            {lead.utilization != null ? (
              <UtilizationGauge
                ratio={lead.utilization}
                available={t('accounts.available', {
                  amount: money(lead.availableCreditCents, lead.currency),
                })}
                locale={locale}
              />
            ) : null}
            {holds.map((c) => (
              <TouchableRipple
                key={`holds-${c.currency}`}
                onPress={() =>
                  openActivity({
                    statuses: 'pending',
                    ...(focused ? { accountIds: focused.account.id } : {}),
                  })
                }
                accessibilityRole="button"
                accessibilityHint={t('dashboard.seeAll')}
                borderless
                style={[styles.pill, card]}>
                <View style={styles.pillInner}>
                  <Icon source="timer-sand" size={16} color={theme.colors.onSurface} />
                  <Text variant="labelLarge">
                    {t('dashboard.holdsPill', { amount: money(c.pendingHoldsCents, c.currency) })}
                  </Text>
                </View>
              </TouchableRipple>
            ))}
          </Animated.View>

          <Animated.View entering={enter(3)} style={styles.section}>
            <PayoffSummaryCard />
          </Animated.View>

          <Animated.View
            key={`coming-${focusKey}`}
            entering={refresh(4)}
            onLayout={(e) => setComingUpY(e.nativeEvent.layout.y)}
            style={styles.section}>
            <Panel
              title={t('dashboard.comingUp')}
              trailing={[...monthlyRecurring]
                .map(([currency, cents]) =>
                  t('recurring.monthlyTotal', { amount: money(cents, currency) }),
                )
                .join(' · ')}>
              <ComingUp
                days={timeline}
                today={today}
                locale={locale}
                onOpenAccount={openAccount}
                onRecordPayment={(due: UpcomingDue) => recordPayment(due.account.id, due.owedCents)}
              />
            </Panel>
          </Animated.View>

          <Animated.View key={`pace-${focusKey}`} entering={refresh(5)} style={styles.section}>
            <Panel title={t('dashboard.paceTitle', { month: monthName })}>
              {spending.length === 0 ? (
                <Text variant="bodyMedium" style={muted}>
                  {t('dashboard.noSpending')}
                </Text>
              ) : (
                spending.map((s) => (
                  <SpendingPaceCard
                    key={s.currency}
                    comparison={s}
                    monthName={monthName}
                    locale={locale}
                    onPress={() =>
                      openActivity({
                        preset: 'thisMonth',
                        types: SPENDING_TYPES.join(','),
                        ...(focused ? { accountIds: focused.account.id } : {}),
                      })
                    }
                  />
                ))
              )}
            </Panel>
          </Animated.View>

          <Animated.View key={`recent-${focusKey}`} entering={refresh(6)} style={styles.sheetWrap}>
            <RecentActivity
              transactions={recent}
              accounts={new Map(cards.map((c) => [c.account.id, c.account]))}
              categories={categories}
              today={today}
              locale={locale}
              showAccount={!focused}
              onOpen={(id) => router.push({ pathname: '/transaction/[id]', params: { id } })}
              onViewAll={() => openActivity(focused ? { accountIds: focused.account.id } : {})}
            />
          </Animated.View>
        </Animated.ScrollView>
      </BalancePrivacy>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { paddingTop: 8, gap: 16, paddingBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12 },
  greeting: { fontWeight: '800', letterSpacing: -0.5 },
  section: { paddingHorizontal: 16, gap: 12 },
  sheetWrap: { paddingHorizontal: 8 },
  pill: { alignSelf: 'flex-start', borderRadius: 999, minHeight: 40, justifyContent: 'center' },
  pillInner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14 },
  pressed: { opacity: 0.7 },
  emptyActions: { padding: 24, gap: 8, alignItems: 'center' },
  button: { minHeight: 48 },
});
