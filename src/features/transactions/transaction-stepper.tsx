import { useState } from 'react';
import { Controller, type FieldPath } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { TextInput as NativeTextInput, Pressable, StyleSheet, View } from 'react-native';
import {
  Button,
  HelperText,
  Icon,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import * as Haptics from 'expo-haptics';

import { ChoiceRow } from '@/components/choice-row';
import { DateField } from '@/components/date-field';
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
import { formatCents, parseMoneyToCents } from '@/domain/money';
import { isTransferType } from '@/domain/transactions';
import type { TransactionStatus } from '@/domain/types';
import { categoryLabel } from '@/features/categories/category-label';
import { useLocale } from '@/i18n/use-locale';

import { CardThumb } from '@/features/accounts/card-thumb';

import { AccountRow, NoneRow } from './stepper-parts';
import { FORM_TYPES, needsDirection, type TransactionFormValues } from './transaction-form-schema';
import { TYPE_ICONS } from './type-icons';
import { useTransactionForm } from './use-transaction-form';

const STEPS = ['amount', 'type', 'account', 'payee', 'details'] as const;
type Step = (typeof STEPS)[number];

/** What each step must get right before moving on. */
const STEP_FIELDS: Record<Step, FieldPath<TransactionFormValues>[]> = {
  amount: ['amount'],
  type: ['type'],
  account: ['accountId', 'otherAccountId'],
  payee: ['payee'],
  details: [],
};

type Props = {
  defaultValues: TransactionFormValues;
  accounts: readonly Account[];
  categories: readonly Category[];
  /** Save; return whether it worked (a failure stays on the last step). */
  onSubmit: (values: TransactionFormValues) => boolean;
  /** After the "Saved" moment. */
  onDone: () => void;
  /** Start somewhere other than the amount, e.g. on review for a duplicate. */
  initialStep?: Step;
};

/**
 * Adding a transaction as a short guided flow: one question per screen (how much, what kind,
 * which card, who with, then a review), sliding forward and back, ending on a "Saved" moment.
 */
export function TransactionStepper({
  defaultValues,
  accounts,
  categories,
  onSubmit,
  onDone,
  initialStep = 'amount',
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const {
    form: {
      control,
      trigger,
      handleSubmit,
      getValues,
      formState: { errors },
    },
    values: { type, accountId, otherAccountId, payee },
    account,
    otherAccount,
    linked,
    flow,
    errorText,
    suggestions,
    pickPayee,
    changeType,
    changeAccount,
  } = useTransactionForm({ defaultValues, accounts });

  const stepper = useStepper({
    steps: STEPS,
    initial: initialStep,
    validate: (step) => trigger(STEP_FIELDS[step]),
  });
  const { step, goTo, next, advanceSoon } = stepper;
  const [showNotes, setShowNotes] = useState(defaultValues.notes !== '');
  const [saved, setSaved] = useState(false);
  const muted = theme.colors.onSurfaceVariant;

  const save = handleSubmit((values) => {
    if (!onSubmit(values)) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaved(true);
    setTimeout(onDone, SAVED_MS);
  });

  const cents = parseMoneyToCents(getValues('amount'), locale) ?? 0;
  const currency = account?.currency ?? 'CAD';
  const signedAmount = `${flow === 'in' ? '+' : '−'}${formatCents(cents, currency, locale)}`;
  const transfer = isTransferType(type) && accounts.length > 1;
  // Choosing the account is the whole question unless there's a second account or a direction.
  const accountAnswersStep = !transfer && !needsDirection({ type, otherAccountId });

  const content = () => {
    switch (step) {
      case 'amount':
        return (
          <>
            <StepTitle title={t('stepper.amountTitle')} hint={t('stepper.amountHint')} />
            <Controller
              control={control}
              name="amount"
              render={({ field: { value, onChange } }) => (
                <View style={styles.amountBlock}>
                  <View style={styles.amountRow}>
                    <NativeTextInput
                      accessibilityLabel={t('transactionForm.amount')}
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
          </>
        );

      case 'type':
        return (
          <>
            <StepTitle title={t('stepper.typeTitle')} />
            <ChoiceTiles
              options={FORM_TYPES.map((v) => ({
                value: v,
                label: t(`transactionTypes.${v}`),
                hint: t(`stepper.typeHints.${v}`),
                icon: TYPE_ICONS[v],
              }))}
              value={type}
              onPick={(picked) => {
                changeType(picked);
                advanceSoon();
              }}
            />
          </>
        );

      case 'account':
        return (
          <>
            <StepTitle
              title={t('stepper.accountTitle')}
              hint={t(`stepper.accountHint.${flow === 'in' ? 'in' : 'out'}`)}
            />
            <View style={styles.list} accessibilityRole="radiogroup">
              {accounts.map((a) => (
                <AccountRow
                  key={a.id}
                  account={a}
                  selected={a.id === accountId}
                  onPress={() => {
                    changeAccount(a.id);
                    if (accountAnswersStep) advanceSoon();
                  }}
                />
              ))}
            </View>
            {errors.accountId ? (
              <HelperText type="error">{errorText(errors.accountId)}</HelperText>
            ) : null}

            {transfer ? (
              <Controller
                control={control}
                name="otherAccountId"
                render={({ field: { value, onChange } }) => (
                  <View style={styles.subsection}>
                    <Text variant="titleMedium">{t('transactionForm.otherAccount')}</Text>
                    <Text variant="bodySmall" style={{ color: muted }}>
                      {t('transactionForm.otherAccountHelp')}
                    </Text>
                    <View style={styles.list} accessibilityRole="radiogroup">
                      <NoneRow
                        label={t('common.none')}
                        selected={value === ''}
                        onPress={() => onChange('')}
                      />
                      {accounts
                        .filter((a) => a.id !== accountId)
                        .map((a) => (
                          <AccountRow
                            key={a.id}
                            account={a}
                            selected={a.id === value}
                            onPress={() => onChange(a.id)}
                          />
                        ))}
                    </View>
                    {errors.otherAccountId ? (
                      <HelperText type="error">{errorText(errors.otherAccountId)}</HelperText>
                    ) : null}
                  </View>
                )}
              />
            ) : null}

            {needsDirection({ type, otherAccountId }) ? (
              <Controller
                control={control}
                name="direction"
                render={({ field: { value, onChange } }) => (
                  <View style={styles.subsection}>
                    <Text variant="titleMedium">{t('transactionForm.direction')}</Text>
                    <SegmentedButtons
                      value={value}
                      onValueChange={onChange}
                      buttons={[
                        {
                          value: 'out',
                          icon: 'arrow-top-right',
                          label:
                            linked && otherAccount
                              ? t('transactionForm.toAccount', { name: otherAccount.name })
                              : t('transactionForm.moneyOut'),
                          style: styles.segment,
                        },
                        {
                          value: 'in',
                          icon: 'arrow-bottom-left',
                          label:
                            linked && otherAccount
                              ? t('transactionForm.fromAccount', { name: otherAccount.name })
                              : t('transactionForm.moneyIn'),
                          style: styles.segment,
                        },
                      ]}
                    />
                  </View>
                )}
              />
            ) : null}
          </>
        );

      case 'payee':
        return (
          <>
            <StepTitle
              title={linked ? t('stepper.payeeTitleLinked') : t('stepper.payeeTitle')}
              hint={linked ? t('stepper.payeeHintLinked') : undefined}
            />
            <Controller
              control={control}
              name="payee"
              render={({ field: { value, onChange, onBlur } }) => (
                <View>
                  <TextInput
                    mode="outlined"
                    label={linked ? t('transactionForm.payeeOptional') : t('transactionForm.payee')}
                    accessibilityLabel={
                      linked ? t('transactionForm.payeeOptional') : t('transactionForm.payee')
                    }
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
                    outlineStyle={styles.inputOutline}
                  />
                  {errors.payee ? (
                    <HelperText type="error">{errorText(errors.payee)}</HelperText>
                  ) : null}
                </View>
              )}
            />
            {suggestions.length > 0 ? (
              <View style={styles.subsection}>
                <Text variant="labelLarge" style={{ color: muted }}>
                  {payee.trim() ? t('transactionForm.suggestions') : t('stepper.recentPayees')}
                </Text>
                {suggestions.map((s) => (
                  <Pressable
                    key={s.payee}
                    onPress={() => {
                      pickPayee(s.payee);
                      advanceSoon();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={s.payee}
                    style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}>
                    <View
                      style={[
                        styles.suggestionIcon,
                        { backgroundColor: theme.colors.surfaceVariant },
                      ]}>
                      <Icon source="history" size={18} color={muted} />
                    </View>
                    <Text variant="bodyLarge" style={styles.flex} numberOfLines={1}>
                      {s.payee}
                    </Text>
                    <Icon source="chevron-right" size={20} color={muted} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        );

      case 'details':
        return (
          <>
            <StepTitle title={t('stepper.detailsTitle')} hint={t('stepper.detailsHint')} />

            {/* A receipt of the answers so far; tap a line to change it. */}
            <Receipt
              headline={
                <Pressable
                  onPress={() => goTo(0)}
                  accessibilityRole="button"
                  accessibilityLabel={t('stepper.change', {
                    field: `${t('transactionForm.amount')}, ${signedAmount}`,
                  })}
                  style={styles.receiptAmount}>
                  <Text variant="displaySmall" style={styles.receiptAmountText}>
                    {signedAmount}
                  </Text>
                  <Text variant="labelMedium" style={{ color: muted }}>
                    {flow === 'in' ? t('transactionForm.moneyIn') : t('transactionForm.moneyOut')}
                  </Text>
                </Pressable>
              }>
              <ReceiptLine
                icon={TYPE_ICONS[type]}
                label={t(`transactionTypes.${type}`)}
                onPress={() => goTo(1)}
              />
              <ReceiptLine
                leading={account ? <CardThumb account={account} size="sm" /> : undefined}
                label={
                  linked && otherAccount
                    ? `${account?.name ?? ''} ↔ ${otherAccount.name}`
                    : (account?.name ?? '')
                }
                onPress={() => goTo(2)}
              />
              <ReceiptLine
                icon="storefront-outline"
                label={payee.trim() || t('stepper.noPayee')}
                onPress={() => goTo(3)}
              />
            </Receipt>

            <View style={[styles.panel, { backgroundColor: theme.colors.elevation.level1 }]}>
              <View style={styles.panelRow}>
                <Icon source="calendar-blank-outline" size={20} color={muted} />
                <View style={styles.flex}>
                  <Controller
                    control={control}
                    name="date"
                    render={({ field: { value, onChange } }) => (
                      <DateField
                        label={t('transactionForm.date')}
                        value={value}
                        onChange={onChange}
                        error={errorText(errors.date)}
                      />
                    )}
                  />
                </View>
              </View>
              <View style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />
              <Controller
                control={control}
                name="status"
                render={({ field: { value, onChange } }) => (
                  <View style={styles.panelBlock}>
                    <View style={styles.panelRow}>
                      <Icon source="clock-outline" size={20} color={muted} />
                      <Text variant="bodyLarge">{t('transactionForm.status')}</Text>
                    </View>
                    <SegmentedButtons
                      value={value}
                      onValueChange={(v) => onChange(v as TransactionStatus)}
                      density="small"
                      buttons={(['posted', 'pending'] as const).map((v) => ({
                        value: v,
                        label: t(`transactionStatuses.${v}`),
                        style: styles.segment,
                      }))}
                    />
                  </View>
                )}
              />
              <View style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />
              <Controller
                control={control}
                name="categoryId"
                render={({ field: { value, onChange } }) => (
                  <View style={styles.panelBlock}>
                    <View style={styles.panelRow}>
                      <Icon source="tag-outline" size={20} color={muted} />
                      <Text variant="bodyLarge">{t('transactionForm.category')}</Text>
                    </View>
                    <View style={styles.panelBleed}>
                      <ChoiceRow
                        label={t('transactionForm.category')}
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
            </View>

            {showNotes ? (
              <Controller
                control={control}
                name="notes"
                render={({ field: { value, onChange, onBlur } }) => (
                  <View>
                    <TextInput
                      mode="outlined"
                      label={t('transactionForm.notes')}
                      accessibilityLabel={t('transactionForm.notes')}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      error={!!errors.notes}
                      multiline
                      autoFocus={defaultValues.notes === ''}
                      left={<TextInput.Icon icon="note-text-outline" />}
                      outlineStyle={styles.inputOutline}
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
      saveLabel={t('stepper.save')}
      onSave={() => void save()}
      saved={saved}
      savedLabel={t('stepper.saved')}>
      {content()}
    </StepperFrame>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
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
  list: { gap: 4 },
  subsection: { gap: 8, marginTop: 8 },
  segment: { minHeight: 44, justifyContent: 'center' },
  inputOutline: { borderRadius: 14 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  suggestionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  receipt: { borderRadius: 20, paddingHorizontal: 16, paddingBottom: 8 },
  receiptAmount: { alignItems: 'center', paddingVertical: 18, gap: 2 },
  receiptAmountText: { fontWeight: '700', letterSpacing: -0.5 },
  panel: { borderRadius: 18, paddingVertical: 6, paddingHorizontal: 16 },
  panelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  panelBlock: { paddingBottom: 12, gap: 4 },
  panelBleed: { marginHorizontal: -16 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 32 },
  addNote: { alignSelf: 'flex-start' },
  tall: { minHeight: 52 },
});
