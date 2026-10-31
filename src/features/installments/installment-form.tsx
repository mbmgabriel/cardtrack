import { zodResolver } from '@hookform/resolvers/zod';
import type { ReactNode } from 'react';
import { Controller, useForm, useWatch, type FieldError } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, Text, TextInput, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChoiceRow } from '@/components/choice-row';
import { DateField } from '@/components/date-field';
import { Panel } from '@/components/page-kit';
import { parseISODate, todayISO } from '@/domain/dates';
import { installmentAmountCents, installmentStatus } from '@/domain/installments';
import { formatCents } from '@/domain/money';
import { useLocale } from '@/i18n/use-locale';

import {
  installmentFormSchema,
  MONTH_CHOICES,
  previewPlan,
  type InstallmentFormValues,
} from './installment-form-schema';

type Props = {
  defaultValues: InstallmentFormValues;
  currency: string;
  submitLabel: string;
  onSubmit: (values: InstallmentFormValues) => void;
  /** Under the form, e.g. delete on the edit screen. */
  footer?: ReactNode;
};

/**
 * An instalment plan on one page: what it's for, how much over how many months, and when the
 * first instalment was (or will be) billed — with a live summary of where the plan stands.
 */
export function InstallmentForm({ defaultValues, currency, submitLabel, onSubmit, footer }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InstallmentFormValues>({
    resolver: zodResolver(installmentFormSchema(locale)),
    defaultValues,
    mode: 'onBlur',
  });
  const values = useWatch({ control }) as InstallmentFormValues;
  const plan = previewPlan(values, locale);
  const status = plan ? installmentStatus(plan, todayISO()) : null;
  const money = (cents: number) => formatCents(cents, currency, locale);
  const muted = theme.colors.onSurfaceVariant;
  const field = { backgroundColor: theme.colors.elevation.level1 };
  const errorText = (error: FieldError | undefined) => (error?.message ? t(error.message) : '');
  const monthYear = (iso: string) =>
    new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(parseISODate(iso));

  const text = (
    name: keyof InstallmentFormValues,
    label: string,
    options: {
      helper?: string;
      keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
      multiline?: boolean;
      affix?: string;
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
            multiline={options.multiline}
            autoCapitalize={name === 'description' ? 'sentences' : 'none'}
            right={options.affix ? <TextInput.Affix text={options.affix} /> : undefined}
            outlineStyle={styles.outline}
            style={field}
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

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic">
          {/* Where the plan stands, as soon as it adds up. */}
          <View
            style={[styles.summary, { backgroundColor: theme.colors.inverseSurface }]}
            accessible
            accessibilityLiveRegion="polite">
            {plan && status ? (
              <>
                <Text style={[styles.summaryBig, { color: theme.colors.inverseOnSurface }]}>
                  {t('installmentForm.perMonth', {
                    amount: money(
                      installmentAmountCents(plan, Math.min(status.paidCount, plan.months - 1)),
                    ),
                  })}
                </Text>
                <Text style={[styles.summaryLine, { color: theme.colors.inverseOnSurface }]}>
                  {status.done
                    ? t('installments.finished', { date: monthYear(status.lastDate) })
                    : t('installments.progress', {
                        paid: status.paidCount,
                        months: plan.months,
                        left: money(status.remainingCents),
                        end: monthYear(status.lastDate),
                      })}
                </Text>
              </>
            ) : (
              <Text style={[styles.summaryLine, { color: theme.colors.inverseOnSurface }]}>
                {t('installmentForm.summaryEmpty')}
              </Text>
            )}
          </View>

          <Panel>
            {text('description', t('installmentForm.description'), {
              helper: t('installmentForm.descriptionHelp'),
            })}
            {text('principal', t('installmentForm.principal'), {
              keyboardType: 'decimal-pad',
              affix: currency,
            })}
          </Panel>

          <Panel title={t('installmentForm.monthsTitle')}>
            <Controller
              control={control}
              name="months"
              render={({ field: { value, onChange } }) => (
                <View style={styles.bleed}>
                  <ChoiceRow
                    label={t('installmentForm.monthsTitle')}
                    value={value}
                    onChange={onChange}
                    options={[
                      ...MONTH_CHOICES.map((m) => ({
                        value: String(m),
                        label: t('installmentForm.monthsOption', { count: m }),
                      })),
                      ...(MONTH_CHOICES.some((m) => String(m) === value) || value === ''
                        ? []
                        : [
                            {
                              value,
                              label: t('installmentForm.monthsOption', { count: Number(value) }),
                            },
                          ]),
                    ]}
                  />
                </View>
              )}
            />
            {text('months', t('installmentForm.monthsCustom'), { keyboardType: 'number-pad' })}
            {text('monthly', t('installmentForm.monthly'), {
              keyboardType: 'decimal-pad',
              affix: currency,
              helper:
                plan && values.monthly.trim() === ''
                  ? t('installmentForm.monthlyAuto', { amount: money(plan.monthlyCents) })
                  : t('installmentForm.monthlyHelp'),
            })}
            {text('monthlyFee', t('installmentForm.fee'), {
              keyboardType: 'decimal-pad',
              affix: currency,
              helper: t('installmentForm.feeHelp'),
            })}
          </Panel>

          <Panel>
            <Controller
              control={control}
              name="firstPaymentDate"
              render={({ field: { value, onChange } }) => (
                <DateField
                  label={t('installmentForm.firstPayment')}
                  value={value}
                  onChange={onChange}
                  error={errorText(errors.firstPaymentDate)}
                />
              )}
            />
            <Text variant="bodySmall" style={{ color: muted }}>
              {t('installmentForm.firstPaymentHelp')}
            </Text>
            {text('notes', t('installmentForm.notes'), { multiline: true })}
          </Panel>

          {footer}
        </ScrollView>

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
  bleed: { marginHorizontal: -20 },
  summary: { borderRadius: 24, padding: 20, gap: 4 },
  summaryBig: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8 },
  summaryLine: { fontSize: 15, opacity: 0.85 },
  saveBar: { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  save: { borderRadius: 16 },
  saveContent: { minHeight: 52 },
  saveLabel: { fontSize: 16, fontWeight: '600' },
});
