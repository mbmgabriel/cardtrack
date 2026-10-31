import { useState, type ReactNode } from 'react';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  TextInput as NativeTextInput,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  Button,
  HelperText,
  Icon,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChoiceRow } from '@/components/choice-row';
import { DateField } from '@/components/date-field';
import { Panel, RowDivider } from '@/components/page-kit';
import type { Account, Category } from '@/db/schema';
import { isTransferType } from '@/domain/transactions';
import type { TransactionStatus } from '@/domain/types';
import { categoryLabel } from '@/features/categories/category-label';

import { AccountPicker } from './account-picker';
import { FORM_TYPES, needsDirection, type TransactionFormValues } from './transaction-form-schema';
import { TYPE_ICONS } from './type-icons';
import { useTransactionForm } from './use-transaction-form';
import { statusColors } from '@/theme';

type Props = {
  defaultValues: TransactionFormValues;
  accounts: readonly Account[];
  categories: readonly Category[];
  submitLabel: string;
  onSubmit: (values: TransactionFormValues) => void;
  /** New transactions start on the amount and can become linked transfers. */
  mode: 'new' | 'edit';
  /** Editing one side of a transfer: account, type and direction are fixed. */
  linkedAccountName?: string;
  /** Let a remembered payee also pick the account (quick-add not opened from an account). */
  rememberAccount?: boolean;
  footer?: ReactNode;
};

export function TransactionForm({
  defaultValues,
  accounts,
  categories,
  submitLabel,
  onSubmit,
  mode,
  linkedAccountName,
  rememberAccount = false,
  footer,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const linkedEdit = linkedAccountName != null;
  const {
    form: {
      control,
      handleSubmit,
      formState: { errors, isSubmitting },
    },
    values: { type, accountId, otherAccountId },
    account,
    otherAccount,
    linked,
    flow,
    errorText,
    suggestions,
    pickPayee,
    changeType,
    changeAccount,
  } = useTransactionForm({ defaultValues, accounts, linkedEdit });
  const [showNotes, setShowNotes] = useState(defaultValues.notes !== '');

  const statuses: TransactionStatus[] =
    mode === 'edit' ? ['posted', 'pending', 'void'] : ['posted', 'pending'];
  const muted = theme.colors.onSurfaceVariant;
  const status = statusColors(theme);
  // Fields sit on white panels, so their background is the panel's, not the page's.
  const field = { backgroundColor: theme.colors.elevation.level1 };
  const overline = (text: string) => (
    <Text variant="labelMedium" style={[styles.overline, { color: muted }]}>
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
          {/* The amount is the point of the form: big, centred, with which way it goes. */}
          <Panel>
            <Controller
              control={control}
              name="amount"
              render={({ field: { value, onChange, onBlur } }) => (
                <View style={styles.hero}>
                  <View style={styles.amountRow}>
                    <Text
                      variant="displaySmall"
                      style={{ color: muted }}
                      importantForAccessibility="no">
                      {flow === 'in' ? '+' : '−'}
                    </Text>
                    <NativeTextInput
                      accessibilityLabel={t('transactionForm.amount')}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      placeholder="0.00"
                      placeholderTextColor={theme.colors.outline}
                      keyboardType="decimal-pad"
                      autoFocus={mode === 'new'}
                      selectionColor={theme.colors.primary}
                      style={[
                        styles.amount,
                        { color: errors.amount ? theme.colors.error : theme.colors.onSurface },
                      ]}
                    />
                    {account ? (
                      <Text variant="titleMedium" style={{ color: muted }}>
                        {account.currency}
                      </Text>
                    ) : null}
                  </View>
                  {errors.amount ? (
                    <HelperText type="error" style={styles.center}>
                      {errorText(errors.amount)}
                    </HelperText>
                  ) : (
                    <View
                      style={[
                        styles.flow,
                        {
                          backgroundColor:
                            flow === 'in' ? status.successSoft : theme.colors.surfaceVariant,
                        },
                      ]}>
                      <Icon
                        source={flow === 'in' ? 'arrow-bottom-left' : 'arrow-top-right'}
                        size={14}
                        color={flow === 'in' ? status.success : muted}
                      />
                      <Text
                        variant="labelMedium"
                        style={{ color: flow === 'in' ? status.success : muted }}>
                        {flow === 'in'
                          ? t('transactionForm.moneyIn')
                          : t('transactionForm.moneyOut')}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            />

            {!linkedEdit ? (
              <Controller
                control={control}
                name="type"
                render={({ field: { value } }) => (
                  <View style={styles.panelBleed}>
                    <ChoiceRow
                      label={t('transactionForm.type')}
                      value={value}
                      onChange={changeType}
                      options={FORM_TYPES.map((v) => ({
                        value: v,
                        label: t(`transactionTypes.${v}`),
                        icon: TYPE_ICONS[v],
                      }))}
                    />
                  </View>
                )}
              />
            ) : null}
          </Panel>

          {/* Who it was with, and which of the user's accounts it touched. */}
          <Panel>
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
                    left={<TextInput.Icon icon="storefront-outline" />}
                    outlineStyle={styles.inputOutline}
                    style={field}
                  />
                  {errors.payee ? (
                    <HelperText type="error">{errorText(errors.payee)}</HelperText>
                  ) : null}
                </View>
              )}
            />
            {suggestions.length > 0 && !linkedEdit ? (
              <View style={[styles.panelBleed, styles.tight]}>
                <ChoiceRow
                  label={t('transactionForm.suggestions')}
                  value={'' as string}
                  onChange={(name) => pickPayee(name, { type: true, account: rememberAccount })}
                  options={suggestions.map((s) => ({
                    value: s.payee,
                    label: s.payee,
                    icon: 'history',
                  }))}
                />
              </View>
            ) : null}

            {linkedEdit ? (
              <View
                style={[styles.notice, { backgroundColor: theme.colors.secondaryContainer }]}
                accessible
                accessibilityRole="text">
                <Icon source="link-variant" size={20} color={theme.colors.onSecondaryContainer} />
                <Text
                  variant="bodySmall"
                  style={[styles.noticeText, { color: theme.colors.onSecondaryContainer }]}>
                  {t('transactionForm.linkedNote', { name: linkedAccountName })}
                </Text>
              </View>
            ) : (
              <>
                <Controller
                  control={control}
                  name="accountId"
                  render={({ field: { value } }) => (
                    <View style={styles.group}>
                      {overline(t('transactionForm.account'))}
                      <View style={styles.pickerBleed}>
                        <AccountPicker
                          label={t('transactionForm.account')}
                          accounts={accounts}
                          value={value}
                          onChange={changeAccount}
                        />
                      </View>
                      {errors.accountId ? (
                        <HelperText type="error">{errorText(errors.accountId)}</HelperText>
                      ) : null}
                    </View>
                  )}
                />

                {isTransferType(type) && mode === 'new' && accounts.length > 1 ? (
                  <Controller
                    control={control}
                    name="otherAccountId"
                    render={({ field: { value, onChange } }) => (
                      <View style={styles.group}>
                        {overline(t('transactionForm.otherAccount'))}
                        <View style={styles.pickerBleed}>
                          <AccountPicker
                            label={t('transactionForm.otherAccount')}
                            accounts={accounts.filter((a) => a.id !== accountId)}
                            value={value}
                            onChange={onChange}
                            noneLabel={t('common.none')}
                          />
                        </View>
                        <HelperText type={errors.otherAccountId ? 'error' : 'info'}>
                          {errors.otherAccountId
                            ? errorText(errors.otherAccountId)
                            : t('transactionForm.otherAccountHelp')}
                        </HelperText>
                      </View>
                    )}
                  />
                ) : null}

                {needsDirection({ type, otherAccountId }) ? (
                  <Controller
                    control={control}
                    name="direction"
                    render={({ field: { value, onChange } }) => (
                      <View style={styles.group}>
                        {overline(t('transactionForm.direction'))}
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
            )}
          </Panel>

          {/* Details that usually keep their defaults, grouped out of the way. */}
          <Panel padded={false}>
            <View style={[styles.panelRow, styles.inset]}>
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
            <RowDivider />
            <Controller
              control={control}
              name="status"
              render={({ field: { value, onChange } }) => (
                <View style={[styles.panelBlock, styles.inset]}>
                  <View style={styles.panelRow}>
                    <Icon source="clock-outline" size={20} color={muted} />
                    <Text variant="bodyLarge">{t('transactionForm.status')}</Text>
                  </View>
                  <SegmentedButtons
                    value={value}
                    onValueChange={(v) => onChange(v as TransactionStatus)}
                    density="small"
                    buttons={statuses.map((v) => ({
                      value: v,
                      label: t(`transactionStatuses.${v}`),
                      style: styles.segment,
                    }))}
                  />
                </View>
              )}
            />
            <RowDivider />
            <Controller
              control={control}
              name="categoryId"
              render={({ field: { value, onChange } }) => (
                <View style={styles.panelBlock}>
                  <View style={[styles.panelRow, styles.inset]}>
                    <Icon source="tag-outline" size={20} color={muted} />
                    <Text variant="bodyLarge">{t('transactionForm.category')}</Text>
                  </View>
                  <View>
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
            <RowDivider />
            {showNotes ? (
              <Controller
                control={control}
                name="notes"
                render={({ field: { value, onChange, onBlur } }) => (
                  <View style={styles.inset}>
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
                      style={field}
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
                style={[styles.addNote, styles.insetButton]}
                contentStyle={styles.addNoteContent}>
                {t('transactionForm.addNote')}
              </Button>
            )}
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
  center: { textAlign: 'center' },
  container: { padding: 16, gap: 16, paddingBottom: 24 },
  hero: { alignItems: 'center', gap: 6 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  amount: {
    fontSize: 48,
    fontWeight: '600',
    letterSpacing: -1,
    minWidth: 120,
    textAlign: 'center',
    paddingVertical: 4,
    fontVariant: ['tabular-nums'],
  },
  flow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tight: { marginTop: -8 },
  group: { gap: 8 },
  overline: { textTransform: 'uppercase', letterSpacing: 1 },
  inputOutline: { borderRadius: 14 },
  notice: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, alignItems: 'center' },
  noticeText: { flex: 1 },
  segment: { minHeight: 44, justifyContent: 'center' },
  panelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  panelBlock: { paddingBottom: 12, gap: 4 },
  // Sideways rows inside a panel run to its edges, past its 20pt padding.
  panelBleed: { marginHorizontal: -20 },
  pickerBleed: { marginHorizontal: -20 },
  inset: { paddingHorizontal: 16 },
  insetButton: { marginLeft: 6, marginBottom: 4 },
  addNote: { alignSelf: 'flex-start' },
  addNoteContent: { minHeight: 44 },
  saveBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  save: { borderRadius: 16 },
  saveContent: { minHeight: 52 },
  saveLabel: { fontSize: 16, fontWeight: '600' },
});
