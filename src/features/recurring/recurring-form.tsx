import { zodResolver } from '@hookform/resolvers/zod';
import type { ReactNode } from 'react';
import { Controller, useForm, useWatch, type FieldError } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  HelperText,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChoiceRow } from '@/components/choice-row';
import { DateField } from '@/components/date-field';
import { ListRow, Panel, RowDivider } from '@/components/page-kit';
import type { Account, Category } from '@/db/schema';
import { isISODate, parseISODate, todayISO } from '@/domain/dates';
import { firstOccurrenceOnOrAfter } from '@/domain/recurrence';
import { RECURRING_FREQUENCIES } from '@/domain/types';
import { categoryLabel } from '@/features/categories/category-label';
import { useLocale } from '@/i18n/use-locale';

import { recurringFormSchema, type RecurringFormValues } from './recurring-form-schema';

type Props = {
  defaultValues: RecurringFormValues;
  accounts: readonly Account[];
  categories: readonly Category[];
  submitLabel: string;
  onSubmit: (values: RecurringFormValues) => void;
  mode: 'new' | 'edit';
  footer?: ReactNode;
};

type BooleanField = 'hasEndDate' | 'autoCreate' | 'isActive';
type TextField = 'payee' | 'amount' | 'interval' | 'remindDaysBefore' | 'notes';

export function RecurringForm({
  defaultValues,
  accounts,
  categories,
  submitLabel,
  onSubmit,
  mode,
  footer,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecurringFormValues>({
    resolver: zodResolver(recurringFormSchema(locale)),
    defaultValues,
    mode: 'onBlur',
  });
  const [frequency, interval, anchorDate, hasEndDate, endDate, accountId] = useWatch({
    control,
    name: ['frequency', 'interval', 'anchorDate', 'hasEndDate', 'endDate', 'accountId'],
  });
  const errorText = (error: FieldError | undefined) => (error?.message ? t(error.message) : '');
  const account = accounts.find((a) => a.id === accountId);

  const steps = /^\d+$/.test(interval.trim()) ? Number(interval.trim()) : 0;
  const next =
    steps >= 1 && steps <= 52 && isISODate(anchorDate) && (!hasEndDate || isISODate(endDate))
      ? firstOccurrenceOnOrAfter(
          { frequency, interval: steps, anchorDate, endDate: hasEndDate ? endDate : null },
          todayISO(),
        )
      : undefined;

  const textField = (
    name: TextField,
    label: string,
    options: {
      keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
      helper?: string;
      maxLength?: number;
      multiline?: boolean;
      right?: ReactNode;
    } = {},
  ) => (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange, onBlur } }) => (
        <View>
          <TextInput
            mode="outlined"
            label={label}
            accessibilityLabel={label}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={!!errors[name]}
            keyboardType={options.keyboardType ?? 'default'}
            maxLength={options.maxLength}
            multiline={options.multiline}
            autoCapitalize={name === 'payee' ? 'words' : 'sentences'}
            right={options.right}
            outlineStyle={styles.outline}
          />
          {errors[name] ? (
            <HelperText type="error">{errorText(errors[name])}</HelperText>
          ) : options.helper ? (
            <HelperText type="info">{options.helper}</HelperText>
          ) : null}
        </View>
      )}
    />
  );

  const switchRow = (
    name: BooleanField,
    label: string,
    helper?: string,
    icon = 'toggle-switch-outline',
  ) => (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange } }) => (
        <ListRow
          icon={icon}
          title={label}
          description={helper}
          toggle={{ value, onToggle: () => onChange(!value) }}
        />
      )}
    />
  );

  const label = (text: string) => (
    <Text variant="titleSmall" style={styles.label}>
      {text}
    </Text>
  );

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          // iOS 26 headers float over content; this insets the form below the header.
          contentInsetAdjustmentBehavior="automatic">
          <Panel>
            {textField('payee', t('recurringForm.payee'), { helper: t('recurringForm.payeeHelp') })}
            {textField('amount', t('recurringForm.amount'), {
              keyboardType: 'decimal-pad',
              right: account ? <TextInput.Affix text={account.currency} /> : undefined,
            })}
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
            {label(t('recurringForm.account'))}
            <Controller
              control={control}
              name="accountId"
              render={({ field: { value, onChange } }) => (
                <View>
                  <View style={styles.bleed}>
                    <ChoiceRow
                      label={t('recurringForm.account')}
                      value={value}
                      onChange={onChange}
                      options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                    />
                  </View>
                  {errors.accountId ? (
                    <HelperText type="error">{errorText(errors.accountId)}</HelperText>
                  ) : null}
                </View>
              )}
            />
          </Panel>

          <Panel title={t('recurringForm.frequency')}>
            <Controller
              control={control}
              name="frequency"
              render={({ field: { value, onChange } }) => (
                <View style={styles.bleed}>
                  <ChoiceRow
                    label={t('recurringForm.frequency')}
                    value={value}
                    onChange={onChange}
                    options={RECURRING_FREQUENCIES.map((f) => ({
                      value: f,
                      label: t(`frequencies.${f}`),
                    }))}
                  />
                </View>
              )}
            />
            {textField('interval', t('recurringForm.interval'), {
              keyboardType: 'number-pad',
              maxLength: 2,
              helper: t('recurringForm.intervalHelp'),
            })}
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
                  <HelperText type="info">{t('recurringForm.anchorHelp')}</HelperText>
                </View>
              )}
            />
            {next !== undefined ? (
              <Text
                variant="titleSmall"
                accessibilityLiveRegion="polite"
                style={{ color: next ? theme.colors.primary : theme.colors.error }}>
                {next
                  ? t('recurringForm.nextPreview', {
                      date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                        parseISODate(next),
                      ),
                    })
                  : t('recurringForm.noNext')}
              </Text>
            ) : null}
          </Panel>

          <Panel padded={false}>
            {switchRow('hasEndDate', t('recurringForm.hasEndDate'), undefined, 'calendar-end')}
            {hasEndDate ? (
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
            <RowDivider />
            {switchRow(
              'autoCreate',
              t('recurringForm.autoCreate'),
              t('recurringForm.autoCreateHelp'),
              'autorenew',
            )}
            {mode === 'edit' ? (
              <>
                <RowDivider />
                {switchRow(
                  'isActive',
                  t('recurringForm.isActive'),
                  t('recurringForm.isActiveHelp'),
                  'play-pause',
                )}
              </>
            ) : null}
          </Panel>

          <Panel>
            {textField('remindDaysBefore', t('recurringForm.remindDaysBefore'), {
              keyboardType: 'number-pad',
              maxLength: 2,
              helper: t('recurringForm.remindHelp'),
            })}
            {label(t('recurringForm.category'))}
            <Controller
              control={control}
              name="categoryId"
              render={({ field: { value, onChange } }) => (
                <View style={styles.bleed}>
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
              )}
            />
            {textField('notes', t('recurringForm.notes'), { multiline: true })}
          </Panel>

          {footer}
        </ScrollView>

        {/* Save stays in reach, riding above the keyboard. */}
        <View
          style={[
            styles.saveBar,
            { backgroundColor: theme.colors.background, borderColor: theme.colors.outlineVariant },
          ]}>
          <Button
            mode="contained"
            onPress={() => handleSubmit(onSubmit)()}
            loading={isSubmitting}
            style={styles.save}
            contentStyle={styles.saveContent}
            labelStyle={styles.saveLabel}>
            {submitLabel}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16, gap: 14, paddingBottom: 24 },
  outline: { borderRadius: 14 },
  label: { fontWeight: '600' },
  bleed: { marginHorizontal: -20 },
  segment: { minHeight: 44, justifyContent: 'center' },
  inset: { paddingHorizontal: 16, paddingBottom: 12 },
  saveBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  save: { borderRadius: 16 },
  saveContent: { minHeight: 52 },
  saveLabel: { fontSize: 16, fontWeight: '600' },
});
