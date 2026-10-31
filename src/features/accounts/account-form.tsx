import { zodResolver } from '@hookform/resolvers/zod';
import type { ReactNode } from 'react';
import { Controller, useForm, useWatch, type FieldError } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Button, HelperText, Icon, Text, TextInput, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChoiceRow } from '@/components/choice-row';
import { DateField } from '@/components/date-field';
import { Panel } from '@/components/page-kit';
import { ACCOUNT_TYPES, CARD_NETWORKS, hasCardDetails, isLiabilityAccount } from '@/domain/types';
import { useLocale } from '@/i18n/use-locale';
import { readableTextColor } from '@/utils/color';

import { accountFormSchema, type AccountFormValues } from './account-form-schema';
import { ACCOUNT_TYPE_ICONS } from './account-stepper';
import { CardFace } from './card-face';
import { ACCOUNT_COLORS } from './colors';

/** iOS's decimal pad has no minus key; signed amounts need the punctuation keyboard. */
const SIGNED_KEYBOARD = Platform.select({
  ios: 'numbers-and-punctuation',
  default: 'numeric',
} as const);

type Props = {
  defaultValues: AccountFormValues;
  submitLabel: string;
  onSubmit: (values: AccountFormValues) => void;
  /** Extra content under the form (e.g. archive/delete on the edit screen). */
  footer?: ReactNode;
};

/**
 * Every account field on one page, for editing: the card drawn at the top, then grouped panels,
 * with Save pinned at the bottom. Adding an account uses the step-by-step `AccountStepper`.
 */
export function AccountForm({ defaultValues, submitLabel, onSubmit, footer }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema(locale)),
    defaultValues,
    mode: 'onBlur',
  });

  const values = useWatch({ control }) as AccountFormValues;
  const liability = isLiabilityAccount(values.type);
  const card = hasCardDetails(values.type);
  const loan = values.type === 'loan';
  const errorText = (error: FieldError | undefined) => (error?.message ? t(error.message) : '');

  const textField = (
    name: keyof AccountFormValues,
    label: string,
    options: {
      keyboardType?: 'default' | 'number-pad' | 'decimal-pad' | typeof SIGNED_KEYBOARD;
      helper?: string;
      maxLength?: number;
      autoCapitalize?: 'none' | 'characters' | 'words';
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
            value={String(value)}
            onChangeText={onChange}
            onBlur={onBlur}
            error={!!errors[name]}
            keyboardType={options.keyboardType ?? 'default'}
            maxLength={options.maxLength}
            autoCapitalize={options.autoCapitalize ?? 'sentences'}
            accessibilityLabel={label}
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
          <View style={styles.preview}>
            <CardFace
              account={{
                name: values.name,
                type: values.type,
                network: card && values.network ? values.network : null,
                institution: values.institution,
                last4: card && values.last4 ? values.last4 : null,
                color: values.color,
              }}
              placeholder={t('accountStepper.placeholder')}
              scale={0.55}
              style={styles.previewCard}
            />
          </View>

          <Panel>
            {textField('name', t('accountForm.name'), { autoCapitalize: 'words' })}
            {textField('institution', t('accountForm.institution'), {
              autoCapitalize: 'words',
              helper: t('accountForm.institutionHelp'),
            })}
            {label(t('accountForm.type'))}
            <Controller
              control={control}
              name="type"
              render={({ field: { value, onChange } }) => (
                <View style={styles.bleed}>
                  <ChoiceRow
                    label={t('accountForm.type')}
                    value={value}
                    onChange={onChange}
                    options={ACCOUNT_TYPES.map((v) => ({
                      value: v,
                      label: t(`accountTypes.${v}`),
                      icon: ACCOUNT_TYPE_ICONS[v],
                    }))}
                  />
                </View>
              )}
            />
          </Panel>

          {card ? (
            <Panel title={t('accountStepper.cardTitle')}>
              <Controller
                control={control}
                name="network"
                render={({ field: { value, onChange } }) => (
                  <View style={styles.bleed}>
                    <ChoiceRow
                      label={t('accountForm.network')}
                      value={value}
                      onChange={onChange}
                      options={[
                        ...CARD_NETWORKS.map((v) => ({ value: v, label: t(`networks.${v}`) })),
                        { value: '' as const, label: t('accountForm.noNetwork') },
                      ]}
                    />
                  </View>
                )}
              />
              {textField('last4', t('accountForm.last4'), {
                keyboardType: 'number-pad',
                maxLength: 4,
              })}
              <View
                style={[styles.notice, { backgroundColor: theme.colors.secondaryContainer }]}
                accessible
                accessibilityRole="text">
                <Icon
                  source="shield-lock-outline"
                  size={20}
                  color={theme.colors.onSecondaryContainer}
                />
                <Text
                  variant="bodySmall"
                  style={[styles.flex, { color: theme.colors.onSecondaryContainer }]}>
                  {t('accountForm.last4Notice')}
                </Text>
              </View>
            </Panel>
          ) : null}

          <Panel title={liability ? t('accountForm.amountOwed') : t('accountForm.currentBalance')}>
            {textField(
              'openingBalance',
              liability ? t('accountForm.amountOwed') : t('accountForm.currentBalance'),
              {
                keyboardType: SIGNED_KEYBOARD,
                helper: liability
                  ? t('accountForm.amountOwedHelp')
                  : t('accountForm.currentBalanceHelp'),
              },
            )}
            <Controller
              control={control}
              name="openingBalanceDate"
              render={({ field: { value, onChange } }) => (
                <DateField
                  label={t('accountForm.asOf')}
                  value={value}
                  onChange={onChange}
                  error={errorText(errors.openingBalanceDate)}
                />
              )}
            />
            {textField('currency', t('accountForm.currency'), {
              autoCapitalize: 'characters',
              maxLength: 3,
              helper: t('accountForm.currencyHelp'),
            })}
          </Panel>

          {liability ? (
            <Panel title={loan ? t('accountForm.loanDetails') : t('accountForm.creditDetails')}>
              {/* A loan has no limit or statement; its monthly payment is a recurring payment. */}
              {loan
                ? null
                : textField('creditLimit', t('accountForm.creditLimit'), {
                    keyboardType: 'decimal-pad',
                  })}
              {loan
                ? null
                : textField('statementDay', t('accountForm.statementDay'), {
                    keyboardType: 'number-pad',
                    maxLength: 2,
                    helper: t('accountForm.statementDayHelp'),
                  })}
              {loan
                ? null
                : textField('dueDayOffset', t('accountForm.dueDayOffset'), {
                    keyboardType: 'number-pad',
                    maxLength: 2,
                    helper: t('accountForm.dueDayOffsetHelp'),
                  })}
              {textField('interestRate', t('accountForm.interestRate'), {
                keyboardType: 'decimal-pad',
                helper: loan ? t('accountStepper.loanHint') : t('accountForm.interestRateHelp'),
              })}
            </Panel>
          ) : null}

          <Panel title={t('accountForm.color')}>
            <Controller
              control={control}
              name="color"
              render={({ field: { value, onChange } }) => (
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel={t('accountForm.color')}
                  style={styles.swatches}>
                  {ACCOUNT_COLORS.map((color, index) => {
                    const selected = color === value;
                    return (
                      <Pressable
                        key={color}
                        onPress={() => onChange(color)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        accessibilityLabel={t('accountForm.colorOption', {
                          index: index + 1,
                          count: ACCOUNT_COLORS.length,
                        })}
                        style={[
                          styles.swatch,
                          { backgroundColor: color },
                          selected && { borderColor: theme.colors.onSurface },
                        ]}>
                        {selected ? (
                          <Icon source="check" size={20} color={readableTextColor(color)} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            />
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
  preview: { alignItems: 'center', paddingVertical: 4 },
  previewCard: { width: 240, borderRadius: 18 },
  outline: { borderRadius: 14 },
  label: { fontWeight: '600' },
  bleed: { marginHorizontal: -20 },
  notice: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 14, alignItems: 'center' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'transparent',
    borderWidth: 3,
  },
  saveBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  save: { borderRadius: 16 },
  saveContent: { minHeight: 52 },
  saveLabel: { fontSize: 16, fontWeight: '600' },
});
