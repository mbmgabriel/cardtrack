import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { Button, Dialog, HelperText, Portal, Text, TextInput, useTheme } from 'react-native-paper';

import { DateField } from '@/components/date-field';
import { repos } from '@/db';
import type { Transaction } from '@/db/schema';
import { todayISO } from '@/domain/dates';
import { centsToInputString, formatCents, parseMoneyToCents } from '@/domain/money';
import { directionOf, signedAmountCents } from '@/domain/transactions';
import { useLocale } from '@/i18n/use-locale';

import type { RowActions } from './transaction-row';

/**
 * Edit / delete / mark-posted handlers for transaction rows, plus the confirmation dialogs they
 * open. Render `dialogs` once in the screen.
 */
export function useTransactionActions({ onDeleted }: { onDeleted?: () => void } = {}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [posting, setPosting] = useState<Transaction | null>(null);
  const [finalAmount, setFinalAmount] = useState('');
  const [postedDate, setPostedDate] = useState(todayISO());

  const money = (tx: Transaction) =>
    formatCents(tx.amountCents, repos.accounts.getById(tx.accountId)?.currency ?? 'CAD', locale);

  const openEdit = (tx: Transaction) =>
    router.push({ pathname: '/transaction/[id]', params: { id: tx.id } });

  const startPosting = (tx: Transaction) => {
    setFinalAmount(centsToInputString(Math.abs(tx.amountCents), locale));
    setPostedDate(todayISO());
    setPosting(tx);
  };

  const finalCents = parseMoneyToCents(finalAmount, locale);
  const finalValid = finalCents != null && finalCents > 0;

  const confirmPosted = () => {
    if (!posting || !finalValid) return;
    repos.transactions.markPosted(posting.id, {
      amountCents: signedAmountCents('adjustment', finalCents, directionOf(posting.amountCents)),
      postedDate,
    });
    setPosting(null);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    repos.transactions.delete(deleting.id);
    setDeleting(null);
    onDeleted?.();
  };

  const counterpart = deleting ? repos.transactions.counterpart(deleting.id) : undefined;
  const counterpartAccount = counterpart
    ? repos.accounts.getById(counterpart.accountId)
    : undefined;

  const actionsFor = (tx: Transaction): RowActions => ({
    onPress: () => openEdit(tx),
    onEdit: () => openEdit(tx),
    onDelete: () => setDeleting(tx),
    onMarkPosted: tx.status === 'pending' ? () => startPosting(tx) : undefined,
  });

  const dialogs = (
    <Portal>
      <Dialog visible={deleting != null} onDismiss={() => setDeleting(null)}>
        <Dialog.Title>{t('transactions.deleteTitle')}</Dialog.Title>
        <Dialog.Content>
          {deleting ? (
            <Text variant="bodyMedium">
              {counterpartAccount
                ? t('transactions.deleteLinkedBody', {
                    payee: deleting.payee,
                    amount: money(deleting),
                    name: counterpartAccount.name,
                  })
                : t('transactions.deleteBody', { payee: deleting.payee, amount: money(deleting) })}
            </Text>
          ) : null}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => setDeleting(null)}>{t('common.cancel')}</Button>
          <Button textColor={theme.colors.error} onPress={confirmDelete}>
            {t('common.delete')}
          </Button>
        </Dialog.Actions>
      </Dialog>

      <Dialog visible={posting != null} onDismiss={() => setPosting(null)}>
        <Dialog.Title>{t('transactions.postedTitle')}</Dialog.Title>
        <Dialog.Content style={styles.content}>
          <Text variant="bodyMedium">{t('transactions.postedBody')}</Text>
          <TextInput
            mode="outlined"
            label={t('transactions.finalAmount')}
            accessibilityLabel={t('transactions.finalAmount')}
            value={finalAmount}
            onChangeText={setFinalAmount}
            keyboardType="decimal-pad"
            error={!finalValid}
            selectTextOnFocus
          />
          {!finalValid ? (
            <HelperText type="error">{t('transactionForm.errors.amount')}</HelperText>
          ) : null}
          <DateField
            label={t('transactions.postedDate')}
            value={postedDate}
            onChange={setPostedDate}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => setPosting(null)}>{t('common.cancel')}</Button>
          <Button onPress={confirmPosted} disabled={!finalValid}>
            {t('transactions.markPosted')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );

  return {
    actionsFor,
    dialogs,
    requestDelete: setDeleting,
    requestMarkPosted: startPosting,
  };
}

const styles = StyleSheet.create({
  content: { gap: 8 },
});
