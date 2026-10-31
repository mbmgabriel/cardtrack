import { addMonths } from 'date-fns';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Dialog,
  HelperText,
  Icon,
  Portal,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChoiceRow } from '@/components/choice-row';
import { EmptyState } from '@/components/empty-state';
import { Panel, RoundButton } from '@/components/page-kit';
import { parseISODate, todayISO } from '@/domain/dates';
import { centsToInputString, formatCents, parseMoneyToCents } from '@/domain/money';
import { comparePayoff, planProgress, simulatePayoff, type PayoffStrategy } from '@/domain/payoff';
import { formatBps } from '@/domain/rates';
import { CardThumb } from '@/features/accounts/card-thumb';
import { ProgressCard } from '@/features/payoff/progress-card';
import {
  setPayoffExtra,
  setPayoffMinimum,
  setPayoffStrategy,
  startTracking,
  stopTracking,
  usePayoff,
  type PayoffDebt,
} from '@/features/payoff/use-payoff';
import { usePro } from '@/features/pro/use-pro';
import { useLocale } from '@/i18n/use-locale';
import { statusColors } from '@/theme';

/** How much each − / + tap changes the monthly payment. */
const STEP_CENTS = 2500;

/**
 * Debt payoff planner (Pro), as plain answers: when you'll be debt-free (next to paying only the
 * minimums), how much you'll pay each month, and the plan step by step — which debt goes first and
 * where its payment goes once it's paid off.
 */
export default function PayoffScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const pro = usePro();
  const { debts, owedNow, baselines, strategy, extraCents } = usePayoff();
  const [currencyChoice, setCurrency] = useState<string | null>(null);
  const [editing, setEditing] = useState<PayoffDebt | null>(null);
  const [typingTotal, setTypingTotal] = useState(false);
  const currencies = [...new Set(debts.map((d) => d.account.currency))].sort();
  const currency =
    currencyChoice && currencies.includes(currencyChoice) ? currencyChoice : currencies[0];
  const inCurrency = debts.filter((d) => d.account.currency === currency);
  const muted = theme.colors.onSurfaceVariant;
  const status = statusColors(theme);

  const header = <Stack.Screen options={{ title: t('payoff.title') }} />;

  if (!pro) {
    return (
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.flex}>
        {header}
        <ScrollView contentContainerStyle={styles.container}>
          <Panel>
            <Icon source="flag-checkered" size={32} color={theme.colors.primary} />
            <Text variant="titleLarge" style={styles.bold}>
              {t('payoff.proTitle')}
            </Text>
            <Text variant="bodyMedium" style={{ color: muted }}>
              {t('payoff.proBody')}
            </Text>
            <Button
              mode="contained"
              icon="crown-outline"
              onPress={() => router.push('/pro')}
              style={styles.rounded}
              contentStyle={styles.tall}>
              {t('cardArt.seePro')}
            </Button>
          </Panel>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!currency || inCurrency.length === 0) {
    return (
      <>
        {header}
        <EmptyState icon="party-popper" message={t('payoff.noDebts')} />
      </>
    );
  }

  const { plan, minimumsOnly } = comparePayoff(inCurrency, strategy, extraCents);
  const other: PayoffStrategy = strategy === 'avalanche' ? 'snowball' : 'avalanche';
  const otherPlan = simulatePayoff(inCurrency, { strategy: other, extraCents });
  const money = (cents: number) => formatCents(cents, currency, locale);
  const today = parseISODate(todayISO());
  const monthName = (offset: number) =>
    new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(
      addMonths(today, offset),
    );
  const minimums = inCurrency.reduce((s, d) => s + d.minimumCents, 0);
  const monthly = minimums + extraCents;
  const estimated = inCurrency.filter((d) => d.estimated);
  // Progress against the plan the user chose to track, if any.
  const baseline = baselines[currency];
  const progress = baseline
    ? planProgress(
        baseline,
        baseline.debtIds.reduce((sum, id) => sum + (owedNow[id] ?? 0), 0),
        todayISO(),
      )
    : null;
  const track = () =>
    startTracking(currency, {
      startedOn: todayISO(),
      monthlyCents: monthly,
      debtIds: inCurrency.map((d) => d.id),
      balances: plan.balances,
    });
  const anyNoRate = inCurrency.some((d) => d.aprBps == null);

  // The plan as steps: debts in the order they're paid off.
  const paidOff = (id: string) => plan.debts.find((d) => d.id === id)?.paidOffMonth ?? null;
  const steps = [...inCurrency].sort(
    (a, b) => (paidOff(a.id) ?? Infinity) - (paidOff(b.id) ?? Infinity),
  );

  // How much the other order would cost (or save) compared with this one.
  const orderDifference =
    plan.months != null && otherPlan.months != null
      ? otherPlan.interestCents - plan.interestCents
      : null;
  const orderNote =
    orderDifference == null || Math.abs(orderDifference) < 100
      ? t('payoff.orderSame')
      : orderDifference > 0
        ? t('payoff.orderOtherCostsMore', {
            order: t(`payoff.${other}`),
            amount: money(orderDifference),
          })
        : t('payoff.orderOtherSaves', {
            order: t(`payoff.${other}`),
            amount: money(-orderDifference),
          });

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.flex}>
      {header}
      <ScrollView
        contentContainerStyle={styles.container}
        contentInsetAdjustmentBehavior="automatic">
        {currencies.length > 1 ? (
          <View style={styles.bleed}>
            <ChoiceRow
              label={t('payoff.currency')}
              value={currency}
              onChange={setCurrency}
              options={currencies.map((c) => ({ value: c, label: c }))}
            />
          </View>
        ) : null}

        {baseline && progress ? (
          <ProgressCard
            baseline={baseline}
            progress={progress}
            currency={currency}
            locale={locale}
            monthlyNowCents={monthly}
            onRestart={track}
            onStop={() => stopTracking(currency)}
          />
        ) : null}

        {/* 1. The answer, next to what minimums alone would mean. */}
        <View style={styles.compare}>
          <Outcome
            label={t('payoff.yourPlan')}
            when={plan.months != null ? monthName(plan.months) : t('payoff.never')}
            interest={plan.months != null ? money(plan.interestCents) : null}
            emphasis
          />
          <Outcome
            label={t('payoff.minimumsOnlyLabel')}
            when={minimumsOnly.months != null ? monthName(minimumsOnly.months) : t('payoff.never')}
            interest={minimumsOnly.months != null ? money(minimumsOnly.interestCents) : null}
          />
        </View>
        {plan.months == null ? (
          <View style={[styles.callout, { backgroundColor: theme.colors.errorContainer }]}>
            <Icon source="alert-circle-outline" size={22} color={theme.colors.onErrorContainer} />
            <Text
              variant="bodyMedium"
              style={[styles.flex, { color: theme.colors.onErrorContainer }]}>
              {t('payoff.notOnTrackHelp')}
            </Text>
          </View>
        ) : minimumsOnly.months != null && plan.months < minimumsOnly.months ? (
          <View style={[styles.callout, { backgroundColor: status.successSoft }]}>
            <Icon source="piggy-bank-outline" size={22} color={status.success} />
            <Text variant="bodyMedium" style={[styles.flex, { color: status.success }]}>
              {t('payoff.savesShort', {
                interest: money(minimumsOnly.interestCents - plan.interestCents),
                count: minimumsOnly.months - plan.months,
              })}
            </Text>
          </View>
        ) : null}

        {/* 2. One number to choose: what goes toward debt each month. */}
        <Panel title={t('payoff.monthlyTitle')}>
          <View style={styles.stepper}>
            <RoundButton
              icon="minus"
              label={t('payoff.less', { amount: money(STEP_CENTS) })}
              onPress={() => setPayoffExtra(Math.max(0, extraCents - STEP_CENTS))}
            />
            <Pressable
              onPress={() => setTypingTotal(true)}
              accessibilityRole="button"
              accessibilityLabel={t('payoff.monthlyA11y', { amount: money(monthly) })}
              accessibilityHint={t('payoff.typeAmountHint')}
              style={styles.monthly}>
              <Text style={[styles.monthlyAmount, { color: theme.colors.onSurface }]}>
                {money(monthly)}
              </Text>
              <Text variant="labelMedium" style={{ color: muted }}>
                {t('payoff.perMonth')}
              </Text>
            </Pressable>
            <RoundButton
              icon="plus"
              label={t('payoff.more', { amount: money(STEP_CENTS) })}
              onPress={() => setPayoffExtra(extraCents + STEP_CENTS)}
            />
          </View>
          <Text variant="bodyMedium" style={[styles.center, { color: muted }]}>
            {extraCents > 0
              ? t('payoff.breakdown', { minimums: money(minimums), extra: money(extraCents) })
              : t('payoff.breakdownMinimumsOnly', { minimums: money(minimums) })}
          </Text>
        </Panel>

        {!baseline && plan.months != null ? (
          <Panel>
            <View style={styles.trackRow}>
              <Icon source="map-marker-path" size={24} color={theme.colors.primary} />
              <Text variant="bodyMedium" style={[styles.flex, { color: muted }]}>
                {t('payoff.trackHelp')}
              </Text>
            </View>
            <Button
              mode="contained"
              icon="flag-outline"
              onPress={track}
              style={styles.rounded}
              contentStyle={styles.tall}>
              {t('payoff.track')}
            </Button>
          </Panel>
        ) : null}

        {estimated.length > 0 ? (
          <View style={[styles.callout, { backgroundColor: theme.colors.primaryContainer }]}>
            <Icon source="pencil-outline" size={20} color={theme.colors.onPrimaryContainer} />
            <Text
              variant="bodyMedium"
              style={[styles.flex, { color: theme.colors.onPrimaryContainer }]}>
              {t('payoff.estimatedCallout', { count: estimated.length })}
            </Text>
          </View>
        ) : null}

        {/* 3. The plan, step by step. */}
        <Panel title={t('payoff.stepsTitle')}>
          <SegmentedButtons
            value={strategy}
            onValueChange={(v) => setPayoffStrategy(v as PayoffStrategy)}
            density="small"
            buttons={[
              {
                value: 'avalanche',
                label: t('payoff.avalanche'),
                style: styles.segment,
              },
              {
                value: 'snowball',
                label: t('payoff.snowball'),
                style: styles.segment,
              },
            ]}
          />
          <Text variant="bodySmall" style={{ color: muted }}>
            {t(strategy === 'avalanche' ? 'payoff.avalancheHint' : 'payoff.snowballHint')}{' '}
            {orderNote}
          </Text>

          <View style={styles.timeline}>
            {steps.map((d, i) => {
              const month = paidOff(d.id);
              const next = steps[i + 1];
              // What the next debt gets once this one is gone: its own minimum, the extra, and
              // every payment freed up so far.
              const rolled =
                next != null
                  ? next.minimumCents +
                    extraCents +
                    steps.slice(0, i + 1).reduce((s, done) => s + done.minimumCents, 0)
                  : 0;
              const stuck = plan.stuck.includes(d.id);
              return (
                <View key={d.id} style={styles.step}>
                  <View style={styles.rail}>
                    <View
                      style={[
                        styles.node,
                        {
                          backgroundColor:
                            month != null ? theme.colors.primary : theme.colors.error,
                        },
                      ]}>
                      <Text style={[styles.nodeText, { color: theme.colors.onPrimary }]}>
                        {i + 1}
                      </Text>
                    </View>
                    {next ? (
                      <View
                        style={[styles.line, { backgroundColor: theme.colors.outlineVariant }]}
                      />
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => setEditing(d)}
                    accessibilityRole="button"
                    accessibilityLabel={`${i + 1}. ${d.name}, ${month != null ? t('payoff.paidOffIn', { month: monthName(month) }) : t('payoff.never')}`}
                    accessibilityHint={t('payoff.editMinimumHint')}
                    style={({ pressed }) => [styles.stepBody, pressed && styles.pressed]}>
                    <Text variant="labelLarge" style={{ color: theme.colors.primary }}>
                      {month != null ? monthName(month) : t('payoff.never')}
                    </Text>
                    <View style={styles.stepTitle}>
                      <CardThumb account={d.account} size="sm" />
                      <Text
                        variant="titleMedium"
                        style={[styles.flex, styles.bold]}
                        numberOfLines={1}>
                        {t('payoff.paidOffTitle', { name: d.name })}
                      </Text>
                    </View>
                    <Text variant="bodySmall" style={{ color: muted }}>
                      {[
                        t('payoff.owesNow', { amount: money(d.balanceCents) }),
                        d.aprBps != null ? formatBps(d.aprBps, locale) : t('payoff.noRate'),
                        t(d.estimated ? 'payoff.minimumEstimated' : 'payoff.minimum', {
                          amount: money(d.minimumCents),
                        }),
                      ].join(' · ')}
                    </Text>
                    {stuck ? (
                      <Text variant="bodySmall" style={{ color: theme.colors.error }}>
                        {t('payoff.stuck')}
                      </Text>
                    ) : next && month != null ? (
                      <View style={styles.rollover}>
                        <Icon source="arrow-down-right" size={16} color={status.success} />
                        <Text variant="bodySmall" style={[styles.flex, { color: status.success }]}>
                          {t('payoff.rollsTo', { name: next.name, amount: money(rolled) })}
                        </Text>
                      </View>
                    ) : month != null ? (
                      <View style={styles.rollover}>
                        <Icon source="party-popper" size={16} color={status.success} />
                        <Text variant="bodySmall" style={{ color: status.success }}>
                          {t('payoff.allDone')}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Panel>

        <Text variant="bodySmall" style={{ color: muted }}>
          {[t('payoff.assumptions'), anyNoRate ? t('payoff.noRateNote') : null]
            .filter(Boolean)
            .join(' ')}
        </Text>
      </ScrollView>

      {editing ? (
        <MinimumDialog
          debt={editing}
          currency={currency}
          locale={locale}
          onDone={() => setEditing(null)}
        />
      ) : null}
      {typingTotal ? (
        <MonthlyDialog
          monthly={monthly}
          minimums={minimums}
          currency={currency}
          locale={locale}
          onDone={() => setTypingTotal(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

/** One side of the "your plan vs. minimums only" comparison. */
function Outcome({
  label,
  when,
  interest,
  emphasis = false,
}: {
  label: string;
  when: string;
  interest: string | null;
  emphasis?: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const fg = emphasis ? theme.colors.inverseOnSurface : theme.colors.onSurface;
  return (
    <View
      accessible
      accessibilityLabel={[
        label,
        when,
        interest ? t('payoff.interestLine', { amount: interest }) : null,
      ]
        .filter(Boolean)
        .join(', ')}
      style={[
        styles.outcome,
        emphasis
          ? { backgroundColor: theme.colors.inverseSurface }
          : {
              backgroundColor: theme.colors.elevation.level1,
              borderColor: theme.colors.outlineVariant,
              borderWidth: 1,
            },
      ]}>
      <Text style={[styles.outcomeLabel, { color: fg }]}>{label}</Text>
      <Text style={[styles.outcomeWhen, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit>
        {when}
      </Text>
      {interest ? (
        <Text style={[styles.outcomeInterest, { color: fg }]}>
          {t('payoff.interestLine', { amount: interest })}
        </Text>
      ) : null}
    </View>
  );
}

/** Type the monthly amount; it can't go below the minimums. */
function MonthlyDialog({
  monthly,
  minimums,
  currency,
  locale,
  onDone,
}: {
  monthly: number;
  minimums: number;
  currency: string;
  locale: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(centsToInputString(monthly, locale));
  const parsed = parseMoneyToCents(text, locale);
  const tooLow = parsed != null && parsed < minimums;
  const valid = parsed != null && !tooLow;
  return (
    <Portal>
      <Dialog visible onDismiss={onDone}>
        <Dialog.Title>{t('payoff.monthlyTitle')}</Dialog.Title>
        <Dialog.Content>
          <TextInput
            mode="outlined"
            label={t('payoff.perMonth')}
            accessibilityLabel={t('payoff.perMonth')}
            value={text}
            onChangeText={setText}
            keyboardType="decimal-pad"
            autoFocus
            right={<TextInput.Affix text={currency} />}
          />
          <HelperText type={tooLow ? 'error' : 'info'}>
            {t(tooLow ? 'payoff.belowMinimums' : 'payoff.atLeastMinimums', {
              amount: formatCents(minimums, currency, locale),
            })}
          </HelperText>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDone}>{t('common.cancel')}</Button>
          <Button
            disabled={!valid}
            onPress={() => {
              if (parsed != null) setPayoffExtra(parsed - minimums);
              onDone();
            }}>
            {t('common.save')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

/** Set the real minimum payment for one debt (or go back to the estimate). */
function MinimumDialog({
  debt,
  currency,
  locale,
  onDone,
}: {
  debt: PayoffDebt;
  currency: string;
  locale: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(centsToInputString(debt.minimumCents, locale));
  const parsed = parseMoneyToCents(text, locale);
  const valid = parsed != null && parsed > 0;
  return (
    <Portal>
      <Dialog visible onDismiss={onDone}>
        <Dialog.Title>{t('payoff.minimumTitle', { name: debt.name })}</Dialog.Title>
        <Dialog.Content>
          <TextInput
            mode="outlined"
            label={t('payoff.minimumLabel')}
            accessibilityLabel={t('payoff.minimumLabel')}
            value={text}
            onChangeText={setText}
            keyboardType="decimal-pad"
            autoFocus
            right={<TextInput.Affix text={currency} />}
          />
          <HelperText type={valid || text === '' ? 'info' : 'error'}>
            {valid || text === '' ? t('payoff.minimumHelp') : t('payoff.minimumInvalid')}
          </HelperText>
        </Dialog.Content>
        <Dialog.Actions>
          {!debt.estimated ? (
            <Button
              onPress={() => {
                setPayoffMinimum(debt.id, null);
                onDone();
              }}>
              {t('payoff.useEstimate')}
            </Button>
          ) : null}
          <Button onPress={onDone}>{t('common.cancel')}</Button>
          <Button
            disabled={!valid}
            onPress={() => {
              if (parsed != null) setPayoffMinimum(debt.id, parsed);
              onDone();
            }}>
            {t('common.save')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  container: { padding: 16, gap: 14, paddingBottom: 32 },
  bleed: { marginHorizontal: -16 },
  bold: { fontWeight: '700' },
  rounded: { borderRadius: 16 },
  tall: { minHeight: 52 },
  compare: { flexDirection: 'row', gap: 10 },
  outcome: { flex: 1, borderRadius: 22, padding: 16, gap: 4 },
  outcomeLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    opacity: 0.75,
  },
  outcomeWhen: { fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.8 },
  outcomeInterest: { fontSize: 13, opacity: 0.8 },
  callout: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 18 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthly: { flex: 1, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  monthlyAmount: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -1 },
  segment: { minHeight: 44, justifyContent: 'center' },
  timeline: { marginTop: 4 },
  step: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 28 },
  node: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  nodeText: { fontSize: 13, fontWeight: '800' },
  line: { flex: 1, width: 2, marginVertical: 4 },
  stepBody: { flex: 1, gap: 4, paddingBottom: 18 },
  stepTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rollover: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  pressed: { opacity: 0.7 },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
