import { zodResolver } from '@hookform/resolvers/zod';
import * as Haptics from 'expo-haptics';
import { useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch, type FieldError, type FieldPath } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { TextInput as NativeTextInput, Platform, Pressable, StyleSheet, View } from 'react-native';
import { HelperText, Icon, Text, TextInput, useTheme } from 'react-native-paper';

import { ChoiceRow } from '@/components/choice-row';
import { DateField } from '@/components/date-field';
import { Panel } from '@/components/page-kit';
import {
  ChoiceTiles,
  Receipt,
  ReceiptLine,
  SAVED_MS,
  StepperFrame,
  StepTitle,
  useStepper,
} from '@/components/stepper';
import { formatCents, parseMoneyToCents } from '@/domain/money';
import { ACCOUNT_TYPES, CARD_NETWORKS, hasCardDetails, isLiabilityAccount } from '@/domain/types';
import { useLocale } from '@/i18n/use-locale';
import { readableTextColor } from '@/utils/color';

import { accountFormSchema, type AccountFormValues } from './account-form-schema';
import { CardFace } from './card-face';
import { ACCOUNT_COLORS } from './colors';

/** iOS's decimal pad has no minus key; signed amounts need the punctuation keyboard. */
const SIGNED_KEYBOARD = Platform.select({
  ios: 'numbers-and-punctuation',
  default: 'numeric',
} as const);

export const ACCOUNT_TYPE_ICONS: Record<AccountFormValues['type'], string> = {
  credit: 'credit-card-outline',
  debit: 'bank-outline',
  savings: 'piggy-bank-outline',
  line_of_credit: 'cash-multiple',
  loan: 'cash-clock',
  prepaid: 'card-account-details-outline',
  cash: 'cash',
};

type Step = 'type' | 'name' | 'card' | 'look' | 'balance' | 'credit' | 'review';

const STEP_FIELDS: Record<Step, FieldPath<AccountFormValues>[]> = {
  type: ['type'],
  name: ['name', 'institution'],
  card: ['network', 'last4'],
  look: ['color'],
  balance: ['openingBalance', 'openingBalanceDate', 'currency'],
  credit: ['creditLimit', 'statementDay', 'dueDayOffset', 'interestRate'],
  review: [],
};

type Props = {
  defaultValues: AccountFormValues;
  /** Save; return whether it worked (a failure stays on the review). */
  onSubmit: (values: AccountFormValues) => boolean;
  onDone: () => void;
};

/**
 * Adding an account one question at a time, with the card itself drawn at the top and filling in
 * as the user answers: its colour, name, network and last four digits.
 */
export function AccountStepper({ defaultValues, onSubmit, onDone }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const {
    control,
    trigger,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema(locale)),
    defaultValues,
    mode: 'onBlur',
  });
  const values = useWatch({ control }) as AccountFormValues;
  const liability = isLiabilityAccount(values.type);
  const card = hasCardDetails(values.type);
  const loan = values.type === 'loan';
  const steps: Step[] = [
    'type',
    'name',
    ...(card ? (['card'] as const) : []),
    'look',
    'balance',
    ...(liability ? (['credit'] as const) : []),
    'review',
  ];
  const stepper = useStepper({ steps, validate: (step) => trigger(STEP_FIELDS[step]) });
  const { step, goTo, next, advanceSoon } = stepper;
  const [saved, setSaved] = useState(false);
  const muted = theme.colors.onSurfaceVariant;
  const errorText = (error: FieldError | undefined) => (error?.message ? t(error.message) : '');

  const save = handleSubmit((v) => {
    if (!onSubmit(v)) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaved(true);
    setTimeout(onDone, SAVED_MS);
  });

  const field = (
    name: FieldPath<AccountFormValues>,
    label: string,
    options: {
      keyboardType?: 'default' | 'number-pad' | 'decimal-pad' | typeof SIGNED_KEYBOARD;
      helper?: string;
      maxLength?: number;
      autoCapitalize?: 'none' | 'characters' | 'words';
      autoFocus?: boolean;
      icon?: string;
      onSubmit?: () => void;
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
            value={String(value)}
            onChangeText={onChange}
            onBlur={onBlur}
            error={!!errors[name]}
            keyboardType={options.keyboardType ?? 'default'}
            maxLength={options.maxLength}
            autoCapitalize={options.autoCapitalize ?? 'sentences'}
            autoFocus={options.autoFocus}
            returnKeyType={options.onSubmit ? 'next' : undefined}
            onSubmitEditing={options.onSubmit}
            left={options.icon ? <TextInput.Icon icon={options.icon} /> : undefined}
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

  const balanceCents = parseMoneyToCents(values.openingBalance, locale) ?? 0;
  const balanceText = formatCents(
    balanceCents,
    values.currency.trim().toUpperCase() || 'CAD',
    locale,
  );

  const content = (): ReactNode => {
    switch (step) {
      case 'type':
        return (
          <>
            <StepTitle title={t('accountStepper.typeTitle')} />
            <ChoiceTiles
              options={ACCOUNT_TYPES.map((v) => ({
                value: v,
                label: t(`accountTypes.${v}`),
                hint: t(`accountStepper.typeHints.${v}`),
                icon: ACCOUNT_TYPE_ICONS[v],
              }))}
              value={values.type}
              onPick={(picked) => {
                setValue('type', picked);
                advanceSoon();
              }}
            />
          </>
        );

      case 'name':
        return (
          <>
            <StepTitle title={t('accountStepper.nameTitle')} hint={t('accountStepper.nameHint')} />
            {field('name', t('accountForm.name'), {
              autoCapitalize: 'words',
              autoFocus: true,
              icon: 'card-text-outline',
            })}
            {field('institution', t('accountForm.institution'), {
              autoCapitalize: 'words',
              helper: t('accountForm.institutionHelp'),
              icon: 'bank-outline',
              onSubmit: () => void next(),
            })}
          </>
        );

      case 'card':
        return (
          <>
            <StepTitle title={t('accountStepper.cardTitle')} />
            <Text variant="titleMedium" style={styles.label}>
              {t('accountForm.network')}
            </Text>
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
            {field('last4', t('accountForm.last4'), {
              keyboardType: 'number-pad',
              maxLength: 4,
              icon: 'dots-horizontal',
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
          </>
        );

      case 'look':
        return (
          <>
            <StepTitle title={t('accountStepper.lookTitle')} hint={t('accountStepper.lookHint')} />
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
                        onPress={() => {
                          void Haptics.selectionAsync();
                          onChange(color);
                        }}
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
                          <Icon source="check" size={24} color={readableTextColor(color)} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            />
          </>
        );

      case 'balance':
        return (
          <>
            <StepTitle
              title={liability ? t('accountStepper.owedTitle') : t('accountStepper.balanceTitle')}
              hint={
                liability ? t('accountForm.amountOwedHelp') : t('accountForm.currentBalanceHelp')
              }
            />
            <Controller
              control={control}
              name="openingBalance"
              render={({ field: { value, onChange, onBlur } }) => (
                <View style={styles.amountBlock}>
                  <View style={styles.amountRow}>
                    <NativeTextInput
                      accessibilityLabel={
                        liability ? t('accountForm.amountOwed') : t('accountForm.currentBalance')
                      }
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      placeholder="0.00"
                      placeholderTextColor={theme.colors.outlineVariant}
                      keyboardType={SIGNED_KEYBOARD}
                      autoFocus
                      selectionColor={theme.colors.primary}
                      style={[
                        styles.amount,
                        {
                          color: errors.openingBalance
                            ? theme.colors.error
                            : theme.colors.onSurface,
                        },
                      ]}
                    />
                    <Text variant="titleLarge" style={{ color: muted }}>
                      {values.currency.toUpperCase()}
                    </Text>
                  </View>
                  {errors.openingBalance ? (
                    <HelperText type="error" style={styles.center}>
                      {errorText(errors.openingBalance)}
                    </HelperText>
                  ) : null}
                </View>
              )}
            />
            <Panel>
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
              {field('currency', t('accountForm.currency'), {
                autoCapitalize: 'characters',
                maxLength: 3,
                helper: t('accountForm.currencyHelp'),
              })}
            </Panel>
          </>
        );

      case 'credit':
        return (
          <>
            <StepTitle
              title={loan ? t('accountStepper.loanTitle') : t('accountStepper.creditTitle')}
              hint={loan ? t('accountStepper.loanHint') : t('accountStepper.creditHint')}
            />
            {/* A loan has no limit or statement; its monthly payment is a recurring payment. */}
            {loan
              ? null
              : field('creditLimit', t('accountForm.creditLimit'), {
                  keyboardType: 'decimal-pad',
                  icon: 'gauge',
                })}
            {loan
              ? null
              : field('statementDay', t('accountForm.statementDay'), {
                  keyboardType: 'number-pad',
                  maxLength: 2,
                  helper: t('accountForm.statementDayHelp'),
                  icon: 'calendar-month-outline',
                })}
            {loan
              ? null
              : field('dueDayOffset', t('accountForm.dueDayOffset'), {
                  keyboardType: 'number-pad',
                  maxLength: 2,
                  helper: t('accountForm.dueDayOffsetHelp'),
                  icon: 'calendar-clock-outline',
                })}
            {field('interestRate', t('accountForm.interestRate'), {
              keyboardType: 'decimal-pad',
              helper: t('accountForm.interestRateHelp'),
              icon: 'percent-outline',
            })}
          </>
        );

      case 'review':
        return (
          <>
            <StepTitle title={t('stepper.detailsTitle')} hint={t('accountStepper.reviewHint')} />
            <Receipt
              headline={
                <Pressable
                  onPress={() => goTo('balance')}
                  accessibilityRole="button"
                  accessibilityLabel={t('stepper.change', {
                    field: `${liability ? t('accountForm.amountOwed') : t('accountForm.currentBalance')}, ${balanceText}`,
                  })}
                  style={styles.headline}>
                  <Text variant="displaySmall" style={styles.headlineAmount}>
                    {balanceText}
                  </Text>
                  <Text variant="labelMedium" style={{ color: muted }}>
                    {liability ? t('accountForm.amountOwed') : t('accountForm.currentBalance')}
                  </Text>
                </Pressable>
              }>
              <ReceiptLine
                icon={ACCOUNT_TYPE_ICONS[values.type]}
                label={t(`accountTypes.${values.type}`)}
                onPress={() => goTo('type')}
              />
              <ReceiptLine
                icon="card-text-outline"
                label={[values.name, values.institution].filter((s) => s.trim()).join(' · ')}
                onPress={() => goTo('name')}
              />
              {card ? (
                <ReceiptLine
                  icon="credit-card-chip-outline"
                  label={
                    [
                      values.network ? t(`networks.${values.network}`) : null,
                      values.last4 ? `•• ${values.last4}` : null,
                    ]
                      .filter(Boolean)
                      .join(' ') || t('accountForm.noNetwork')
                  }
                  onPress={() => goTo('card')}
                />
              ) : null}
              <ReceiptLine
                icon="palette-outline"
                label={t('accountForm.color')}
                onPress={() => goTo('look')}
              />
              {liability ? (
                <ReceiptLine
                  icon="calendar-month-outline"
                  label={
                    loan
                      ? values.interestRate.trim()
                        ? t('accountStepper.loanRate', { rate: values.interestRate.trim() })
                        : t('accountForm.loanDetails')
                      : values.statementDay.trim()
                        ? t('accountStepper.closesOn', { day: values.statementDay.trim() })
                        : t('accountStepper.noStatement')
                  }
                  onPress={() => goTo('credit')}
                />
              ) : null}
            </Receipt>
          </>
        );
    }
  };

  return (
    <StepperFrame
      stepper={stepper}
      header={
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
            scale={0.5}
            style={styles.previewCard}
          />
        </View>
      }
      saveLabel={t('accountForm.create')}
      onSave={() => void save()}
      saved={saved}
      savedLabel={t('accountStepper.saved')}>
      {content()}
    </StepperFrame>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  preview: { alignItems: 'center', paddingTop: 12 },
  previewCard: { width: 220, borderRadius: 16 },
  outline: { borderRadius: 14 },
  label: { fontWeight: '600' },
  bleed: { marginHorizontal: -20 },
  notice: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 14, alignItems: 'center' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center' },
  swatch: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'transparent',
    borderWidth: 3,
  },
  amountBlock: { alignItems: 'center', paddingVertical: 16 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%' },
  amount: {
    fontSize: 56,
    fontWeight: '700',
    letterSpacing: -1.5,
    minWidth: 140,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  headline: { alignItems: 'center', paddingVertical: 18, gap: 2 },
  headlineAmount: { fontWeight: '700', letterSpacing: -0.5 },
});
