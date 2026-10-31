import { zodResolver } from '@hookform/resolvers/zod';
import * as Haptics from 'expo-haptics';
import { useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch, type FieldError, type FieldPath } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { TextInput as NativeTextInput, Pressable, StyleSheet, View } from 'react-native';
import {
  Button,
  HelperText,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { ChoiceRow } from '@/components/choice-row';
import { DateField } from '@/components/date-field';
import { ListRow, Panel, RowDivider } from '@/components/page-kit';
import {
  ChoiceTiles,
  Receipt,
  ReceiptLine,
  SAVED_MS,
  StepperFrame,
  StepTitle,
  useStepper,
} from '@/components/stepper';
import type { Account, Category } from '@/db/schema';
import { isISODate, parseISODate, todayISO } from '@/domain/dates';
import { formatCents, parseMoneyToCents } from '@/domain/money';
import { firstOccurrenceOnOrAfter } from '@/domain/recurrence';
import { RECURRING_FREQUENCIES, type RecurringFrequency } from '@/domain/types';
import { categoryLabel } from '@/features/categories/category-label';
import { CardThumb } from '@/features/accounts/card-thumb';
import { AccountRow } from '@/features/transactions/stepper-parts';
import { useLocale } from '@/i18n/use-locale';

import { recurringFormSchema, type RecurringFormValues } from './recurring-form-schema';

const FREQUENCY_ICONS: Record<RecurringFrequency, string> = {
  weekly: 'calendar-week',
  biweekly: 'calendar-sync',
  monthly: 'calendar-month-outline',
  quarterly: 'calendar-range',
  yearly: 'calendar-star',
};
const REMIND_OPTIONS = ['0', '1', '2', '3', '5', '7'];

const STEPS = ['amount', 'payee', 'account', 'schedule', 'review'] as const;
type Step = (typeof STEPS)[number];

const STEP_FIELDS: Record<Step, FieldPath<RecurringFormValues>[]> = {
  amount: ['amount', 'direction'],
  payee: ['payee'],
  account: ['accountId'],
  schedule: ['frequency', 'interval', 'anchorDate', 'hasEndDate', 'endDate'],
  review: [],
};

type Props = {
  defaultValues: RecurringFormValues;
  accounts: readonly Account[];
  categories: readonly Category[];
  onSubmit: (values: RecurringFormValues) => boolean;
  onDone: () => void;
};

/**
 * Adding a recurring charge (a subscription, a bill, a paycheque) one question at a time: how
 * much, who, which card, how often, then reminders and the rest on the review.
 */
export function RecurringStepper({ defaultValues, accounts, categories, onSubmit, onDone }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const {
    control,
    trigger,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<RecurringFormValues>({
    resolver: zodResolver(recurringFormSchema(locale)),
    defaultValues,
    mode: 'onBlur',
  });
  const values = useWatch({ control }) as RecurringFormValues;
  const stepper = useStepper({ steps: STEPS, validate: (step) => trigger(STEP_FIELDS[step]) });
  const { step, goTo, next, advanceSoon } = stepper;
  const [saved, setSaved] = useState(false);
  const [showNotes, setShowNotes] = useState(defaultValues.notes !== '');
  const muted = theme.colors.onSurfaceVariant;
  const errorText = (error: FieldError | undefined) => (error?.message ? t(error.message) : '');
  const account = accounts.find((a) => a.id === values.accountId);
  const currency = account?.currency ?? 'CAD';
  const cents = parseMoneyToCents(values.amount, locale) ?? 0;
  const amountText = `${values.direction === 'in' ? '+' : '−'}${formatCents(cents, currency, locale)}`;
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(parseISODate(iso));

  const every = /^\d+$/.test(values.interval.trim()) ? Number(values.interval.trim()) : 0;
  const nextCharge =
    every >= 1 &&
    every <= 52 &&
    isISODate(values.anchorDate) &&
    (!values.hasEndDate || isISODate(values.endDate))
      ? firstOccurrenceOnOrAfter(
          {
            frequency: values.frequency,
            interval: every,
            anchorDate: values.anchorDate,
            endDate: values.hasEndDate ? values.endDate : null,
          },
          todayISO(),
        )
      : undefined;

  const save = handleSubmit((v) => {
    if (!onSubmit(v)) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaved(true);
    setTimeout(onDone, SAVED_MS);
  });

  const content = (): ReactNode => {
    switch (step) {
      case 'amount':
        return (
          <>
            <StepTitle title={t('recurringStepper.amountTitle')} />
            <Controller
              control={control}
              name="amount"
              render={({ field: { value, onChange } }) => (
                <View style={styles.amountBlock}>
                  <View style={styles.amountRow}>
                    <NativeTextInput
                      accessibilityLabel={t('recurringForm.amount')}
                      value={value}
                      onChangeText={onChange}
                      placeholder="0.00"
                      placeholderTextColor={theme.colors.outlineVariant}
                      keyboardType="decimal-pad"
                      autoFocus
                      selectionColor={theme.colors.primary}
                      style={[
                        styles.amount,
                        { color: errors.amount ? theme.colors.error : theme.colors.onSurface },
                      ]}
                    />
                    <Text variant="titleLarge" style={{ color: muted }}>
                      {currency}
                    </Text>
                  </View>
                  {errors.amount ? (
                    <HelperText type="error" style={styles.center}>
                      {errorText(errors.amount)}
                    </HelperText>
                  ) : null}
                </View>
              )}
            />
            <Controller
              control={control}
              name="direction"
              render={({ field: { value, onChange } }) => (
                <SegmentedButtons
                  value={value}
                  onValueChange={onChange}
                  buttons={[
                    {
                      value: 'out',
                      icon: 'arrow-top-right',
                      label: t('recurringForm.moneyOut'),
                      style: styles.segment,
                    },
                    {
                      value: 'in',
                      icon: 'arrow-bottom-left',
                      label: t('recurringForm.moneyIn'),
                      style: styles.segment,
                    },
                  ]}
                />
              )}
            />
          </>
        );

      case 'payee':
        return (
          <>
            <StepTitle
              title={t('recurringStepper.payeeTitle')}
              hint={t('recurringForm.payeeHelp')}
            />
            <Controller
              control={control}
              name="payee"
              render={({ field: { value, onChange, onBlur } }) => (
                <View>
                  <TextInput
                    mode="outlined"
                    label={t('recurringForm.payee')}
                    accessibilityLabel={t('recurringForm.payee')}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={!!errors.payee}
                    autoCapitalize="words"
                    autoCorrect={false}
                    autoFocus
                    returnKeyType="next"
                    onSubmitEditing={() => void next()}
                    left={<TextInput.Icon icon="storefront-outline" />}
                    outlineStyle={styles.outline}
                  />
                  {errors.payee ? (
                    <HelperText type="error">{errorText(errors.payee)}</HelperText>
                  ) : null}
                </View>
              )}
            />
          </>
        );

      case 'account':
        return (
          <>
            <StepTitle title={t('recurringStepper.accountTitle')} />
            <View style={styles.list} accessibilityRole="radiogroup">
              {accounts.map((a) => (
                <AccountRow
                  key={a.id}
                  account={a}
                  selected={a.id === values.accountId}
                  onPress={() => {
                    setValue('accountId', a.id);
                    advanceSoon();
                  }}
                />
              ))}
            </View>
            {errors.accountId ? (
              <HelperText type="error">{errorText(errors.accountId)}</HelperText>
            ) : null}
          </>
        );

      case 'schedule':
        return (
          <>
            <StepTitle title={t('recurringStepper.scheduleTitle')} />
            <ChoiceTiles
              options={RECURRING_FREQUENCIES.map((f) => ({
                value: f,
                label: t(`frequencies.${f}`),
                icon: FREQUENCY_ICONS[f],
              }))}
              value={values.frequency}
              onPick={(f) => setValue('frequency', f)}
            />
            <Panel>
              <Controller
                control={control}
                name="anchorDate"
                render={({ field: { value, onChange } }) => (
                  <View>
                    <DateField
                      label={t('recurringForm.anchorDate')}
                      value={value}
                      onChange={onChange}
                      error={errorText(errors.anchorDate)}
                    />
                    <Text variant="bodySmall" style={{ color: muted }}>
                      {t('recurringForm.anchorHelp')}
                    </Text>
                  </View>
                )}
              />
              <Controller
                control={control}
                name="interval"
                render={({ field: { value, onChange, onBlur } }) => (
                  <View>
                    <TextInput
                      mode="outlined"
                      label={t('recurringForm.interval')}
                      accessibilityLabel={t('recurringForm.interval')}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      error={!!errors.interval}
                      keyboardType="number-pad"
                      maxLength={2}
                      outlineStyle={styles.outline}
                    />
                    <HelperText type={errors.interval ? 'error' : 'info'}>
                      {errors.interval
                        ? errorText(errors.interval)
                        : t('recurringForm.intervalHelp')}
                    </HelperText>
                  </View>
                )}
              />
            </Panel>
            <Panel padded={false}>
              <Controller
                control={control}
                name="hasEndDate"
                render={({ field: { value, onChange } }) => (
                  <ListRow
                    icon="calendar-end"
                    title={t('recurringForm.hasEndDate')}
                    toggle={{ value, onToggle: () => onChange(!value) }}
                  />
                )}
              />
              {values.hasEndDate ? (
                <View style={styles.inset}>
                  <Controller
                    control={control}
                    name="endDate"
                    render={({ field: { value, onChange } }) => (
                      <DateField
                        label={t('recurringForm.endDate')}
                        value={value}
                        onChange={onChange}
                        error={errorText(errors.endDate)}
                      />
                    )}
                  />
                </View>
              ) : null}
            </Panel>
            {nextCharge !== undefined ? (
              <Text
                variant="titleMedium"
                accessibilityLiveRegion="polite"
                style={[
                  styles.preview,
                  { color: nextCharge ? theme.colors.primary : theme.colors.error },
                ]}>
                {nextCharge
                  ? t('recurringForm.nextPreview', { date: date(nextCharge) })
                  : t('recurringForm.noNext')}
              </Text>
            ) : null}
          </>
        );

      case 'review':
        return (
          <>
            <StepTitle title={t('stepper.detailsTitle')} hint={t('recurringStepper.reviewHint')} />
            <Receipt
              headline={
                <Pressable
                  onPress={() => goTo('amount')}
                  accessibilityRole="button"
                  accessibilityLabel={t('stepper.change', {
                    field: `${t('recurringForm.amount')}, ${amountText}`,
                  })}
                  style={styles.headline}>
                  <Text variant="displaySmall" style={styles.headlineAmount}>
                    {amountText}
                  </Text>
                  <Text variant="labelMedium" style={{ color: muted }}>
                    {t(`frequencies.${values.frequency}`)}
                  </Text>
                </Pressable>
              }>
              <ReceiptLine
                icon="storefront-outline"
                label={values.payee}
                onPress={() => goTo('payee')}
              />
              <ReceiptLine
                leading={account ? <CardThumb account={account} size="sm" /> : undefined}
                label={account?.name ?? ''}
                onPress={() => goTo('account')}
              />
              <ReceiptLine
                icon={FREQUENCY_ICONS[values.frequency]}
                label={
                  nextCharge
                    ? t('recurringForm.nextPreview', { date: date(nextCharge) })
                    : t(`frequencies.${values.frequency}`)
                }
                onPress={() => goTo('schedule')}
              />
            </Receipt>

            <Panel padded={false}>
              <Controller
                control={control}
                name="autoCreate"
                render={({ field: { value, onChange } }) => (
                  <ListRow
                    icon="autorenew"
                    title={t('recurringForm.autoCreate')}
                    description={t('recurringForm.autoCreateHelp')}
                    toggle={{ value, onToggle: () => onChange(!value) }}
                  />
                )}
              />
              <RowDivider />
              <Controller
                control={control}
                name="remindDaysBefore"
                render={({ field: { value, onChange } }) => (
                  <View style={styles.block}>
                    <Text variant="titleMedium" style={styles.bold}>
                      {t('recurringForm.remindDaysBefore')}
                    </Text>
                    <View style={styles.bleedPanel}>
                      <ChoiceRow
                        label={t('recurringForm.remindDaysBefore')}
                        value={value}
                        onChange={onChange}
                        options={[...new Set([...REMIND_OPTIONS, value])]
                          .sort((a, b) => Number(a) - Number(b))
                          .map((n) => ({
                            value: n,
                            label:
                              n === '0'
                                ? t('recurringStepper.onTheDay')
                                : t('recurringStepper.daysBefore', { count: Number(n) }),
                          }))}
                      />
                    </View>
                    <Text variant="bodySmall" style={{ color: muted }}>
                      {t('recurringForm.remindHelp')}
                    </Text>
                  </View>
                )}
              />
              <RowDivider />
              <Controller
                control={control}
                name="categoryId"
                render={({ field: { value, onChange } }) => (
                  <View style={styles.block}>
                    <Text variant="titleMedium" style={styles.bold}>
                      {t('recurringForm.category')}
                    </Text>
                    <View style={styles.bleedPanel}>
                      <ChoiceRow
                        label={t('recurringForm.category')}
                        value={value}
                        onChange={onChange}
                        options={[
                          { value: '', label: t('common.none') },
                          ...categories.map((c) => ({
                            value: c.id,
                            label: categoryLabel(c, t),
                            icon: c.icon ?? undefined,
                          })),
                        ]}
                      />
                    </View>
                  </View>
                )}
              />
            </Panel>

            {showNotes ? (
              <Controller
                control={control}
                name="notes"
                render={({ field: { value, onChange, onBlur } }) => (
                  <View>
                    <TextInput
                      mode="outlined"
                      label={t('recurringForm.notes')}
                      accessibilityLabel={t('recurringForm.notes')}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      error={!!errors.notes}
                      multiline
                      autoFocus={defaultValues.notes === ''}
                      left={<TextInput.Icon icon="note-text-outline" />}
                      outlineStyle={styles.outline}
                    />
                    {errors.notes ? (
                      <HelperText type="error">{errorText(errors.notes)}</HelperText>
                    ) : null}
                  </View>
                )}
              />
            ) : (
              <Button
                icon="note-plus-outline"
                mode="text"
                onPress={() => setShowNotes(true)}
                style={styles.addNote}
                contentStyle={styles.tall}>
                {t('transactionForm.addNote')}
              </Button>
            )}
          </>
        );
    }
  };

  return (
    <StepperFrame
      stepper={stepper}
      saveLabel={t('recurringStepper.save')}
      onSave={() => void save()}
      saved={saved}
      savedLabel={t('stepper.saved')}>
      {content()}
    </StepperFrame>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  outline: { borderRadius: 14 },
  segment: { minHeight: 44, justifyContent: 'center' },
  list: { gap: 4 },
  inset: { paddingHorizontal: 16, paddingBottom: 12 },
  preview: { textAlign: 'center', fontWeight: '600' },
  block: { paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  bleedPanel: { marginHorizontal: -16 },
  bold: { fontWeight: '600' },
  addNote: { alignSelf: 'flex-start' },
  tall: { minHeight: 52 },
  amountBlock: { alignItems: 'center', paddingVertical: 24 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%' },
  amount: {
    fontSize: 60,
    fontWeight: '700',
    letterSpacing: -1.5,
    minWidth: 140,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  headline: { alignItems: 'center', paddingVertical: 18, gap: 2 },
  headlineAmount: { fontWeight: '700', letterSpacing: -0.5 },
});
