import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  Checkbox,
  Dialog,
  Divider,
  HelperText,
  IconButton,
  List,
  Portal,
  Switch,
  Text,
  TextInput,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';

import { DateField } from '@/components/date-field';
import { EmptyState } from '@/components/empty-state';
import { repos } from '@/db';
import type { Statement } from '@/db/schema';
import { isISODate, parseISODate, todayISO } from '@/domain/dates';
import { centsToInputString, formatCents, parseMoneyToCents } from '@/domain/money';
import { runDailyJobs } from '@/features/background/daily-jobs';
import { statusColor, StatusBadge } from '@/features/statements/status-badge';
import { useStatement } from '@/features/statements/use-statements';
import { formatSignedCents } from '@/features/transactions/transaction-row';
import { useLocale } from '@/i18n/use-locale';

type Draft = { closing: string; minimum: string; dueDate: string; notes: string };

export default function StatementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const current = useStatement(id, todayISO());
  const [reconciling, setReconciling] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  if (!current) return <EmptyState icon="file-remove-outline" message={t('statements.notFound')} />;
  const { account, view } = current;
  const { statement, summary } = view;
  const money = (cents: number) => formatCents(cents, account.currency, locale);
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(parseISODate(iso));
  const shortDate = (iso: string) =>
    new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(parseISODate(iso));
  const muted = { color: theme.colors.onSurfaceVariant };
  const good = statusColor('paid', theme);
  const closed = todayISO() > statement.periodEnd;

  const openEditor = () =>
    setDraft({
      closing:
        statement.closingBalanceCents == null
          ? ''
          : centsToInputString(statement.closingBalanceCents, locale),
      minimum:
        statement.minimumPaymentCents == null
          ? ''
          : centsToInputString(statement.minimumPaymentCents, locale),
      dueDate: statement.dueDate,
      notes: statement.notes ?? '',
    });

  const parseOptional = (value: string) =>
    value.trim() === '' ? null : parseMoneyToCents(value, locale);
  const draftErrors = draft
    ? {
        closing: draft.closing.trim() !== '' && parseOptional(draft.closing) == null,
        minimum:
          draft.minimum.trim() !== '' &&
          (parseOptional(draft.minimum) == null || parseOptional(draft.minimum)! < 0),
        dueDate: !isISODate(draft.dueDate),
      }
    : undefined;

  const saveDraft = () => {
    if (!draft || !draftErrors || Object.values(draftErrors).some(Boolean)) return;
    const patch: Partial<Statement> = {
      closingBalanceCents: parseOptional(draft.closing),
      minimumPaymentCents: parseOptional(draft.minimum),
      dueDate: draft.dueDate,
      notes: draft.notes.trim() === '' ? null : draft.notes.trim(),
    };
    repos.statements.update(id, patch);
    runDailyJobs();
    setDraft(null);
  };

  const row = (label: string, value: string, options: { color?: string; hint?: string } = {}) => (
    <View style={styles.row} accessible accessibilityLabel={`${label}, ${value}`}>
      <View style={styles.flex}>
        <Text variant="bodyLarge">{label}</Text>
        {options.hint ? (
          <Text variant="bodySmall" style={muted}>
            {options.hint}
          </Text>
        ) : null}
      </View>
      <Text variant="bodyLarge" style={options.color ? { color: options.color } : undefined}>
        {value}
      </Text>
    </View>
  );

  const difference = summary.differenceCents;
  const recon = view.reconcile;

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen
        options={{
          title: `${account.name} · ${shortDate(statement.periodEnd)}`,
          headerRight: () => (
            <IconButton
              icon="pencil-outline"
              accessibilityLabel={t('statements.editDetails')}
              onPress={openEditor}
            />
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.container}
        contentInsetAdjustmentBehavior="automatic">
        <Card mode="elevated">
          <Card.Content style={styles.card}>
            <View style={styles.row}>
              <Text variant="titleMedium" style={styles.flex}>
                {t('statements.period', {
                  start: shortDate(statement.periodStart),
                  end: shortDate(statement.periodEnd),
                })}
              </Text>
              <StatusBadge status={summary.status} />
            </View>
            <Text variant="bodyMedium" style={muted}>
              {closed
                ? t('statements.closedOn', { date: date(statement.periodEnd) })
                : t('statements.closesOn', { date: date(statement.periodEnd) })}
            </Text>
            {row(t('statements.dueDate'), date(statement.dueDate), {
              color: summary.status === 'overdue' ? theme.colors.error : undefined,
            })}
          </Card.Content>
        </Card>

        <Card mode="elevated">
          <Card.Content style={styles.card}>
            {row(
              t('statements.statementBalance'),
              statement.closingBalanceCents == null
                ? t('statements.notEntered')
                : money(statement.closingBalanceCents),
            )}
            {row(t('statements.computedBalance'), money(view.computedClosingCents))}
            {difference != null ? (
              <>
                {row(
                  t('statements.difference'),
                  difference === 0 ? t('statements.matches') : money(difference),
                  { color: difference === 0 ? good : theme.colors.error },
                )}
                {difference !== 0 ? (
                  <Text variant="bodySmall" style={{ color: theme.colors.error }}>
                    {t('statements.differenceHelp')}
                  </Text>
                ) : null}
              </>
            ) : null}
            {statement.closingBalanceCents == null && closed ? (
              <Button mode="contained-tonal" icon="pencil-outline" onPress={openEditor}>
                {t('statements.editDetails')}
              </Button>
            ) : null}
          </Card.Content>
        </Card>

        <Card mode="elevated">
          <Card.Content style={styles.card}>
            <Text variant="titleSmall" accessibilityRole="header">
              {t('statements.payments')}
            </Text>
            {row(
              t('statements.minimumPayment'),
              statement.minimumPaymentCents == null
                ? t('statements.notEntered')
                : money(statement.minimumPaymentCents),
            )}
            {row(t('statements.paid'), money(view.amountPaidCents))}
            {row(
              t('statements.remaining'),
              summary.paidInFull ? t('statements.paidInFull') : money(summary.remainingCents),
              {
                color: summary.paidInFull ? good : undefined,
                hint:
                  !summary.paidInFull && summary.minimumMet && view.amountPaidCents > 0
                    ? t('statements.minimumMet')
                    : undefined,
              },
            )}
            <Divider />
            {view.payments.length === 0 ? (
              <Text variant="bodySmall" style={muted}>
                {t('statements.noPayments')}
              </Text>
            ) : (
              view.payments.map((p) => (
                <List.Item
                  key={p.id}
                  title={p.payee}
                  description={date(p.date)}
                  onPress={() =>
                    router.push({ pathname: '/transaction/[id]', params: { id: p.id } })
                  }
                  right={() => <Text style={styles.value}>{money(p.amountCents)}</Text>}
                  style={styles.item}
                />
              ))
            )}
            {view.candidates.length > 0 ? (
              <>
                <Text variant="bodySmall" style={muted}>
                  {t('statements.linkHelp')}
                </Text>
                {view.candidates.map((p) => (
                  <List.Item
                    key={p.id}
                    title={`${p.payee} · ${money(p.amountCents)}`}
                    description={date(p.date)}
                    right={() => (
                      <Button
                        onPress={() => {
                          repos.transactions.update(p.id, { statementId: id });
                          runDailyJobs();
                        }}
                        accessibilityLabel={`${t('statements.linkPayment')} ${p.payee} ${money(p.amountCents)}`}>
                        {t('statements.linkPayment')}
                      </Button>
                    )}
                    style={styles.item}
                  />
                ))}
              </>
            ) : null}
            <Button
              mode="outlined"
              icon="cash-plus"
              contentStyle={styles.button}
              onPress={() =>
                router.push({
                  pathname: '/transaction/new',
                  params: { accountId: account.id, type: 'payment', statementId: id },
                })
              }>
              {t('statements.recordPayment')}
            </Button>
          </Card.Content>
        </Card>

        <View style={styles.sectionHeader}>
          <Text variant="titleSmall" accessibilityRole="header" style={styles.flex}>
            {t('statements.transactions')}
          </Text>
          <TouchableRipple
            onPress={() => setReconciling((v) => !v)}
            accessibilityRole="switch"
            accessibilityLabel={t('statements.reconcile')}
            accessibilityState={{ checked: reconciling }}>
            <View style={styles.switchRow}>
              <Text variant="labelLarge">{t('statements.reconcile')}</Text>
              <Switch
                value={reconciling}
                onValueChange={setReconciling}
                importantForAccessibility="no"
              />
            </View>
          </TouchableRipple>
        </View>

        {reconciling ? (
          <View
            style={[styles.banner, { backgroundColor: theme.colors.secondaryContainer }]}
            accessibilityLiveRegion="polite">
            <Text variant="bodySmall" style={{ color: theme.colors.onSecondaryContainer }}>
              {t('statements.reconcileHelp')}
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSecondaryContainer }}>
              {t('statements.cleared', {
                previous: money(view.previousClosingCents),
                cleared: money(recon.clearedCents),
              })}
            </Text>
            <Text
              variant="titleSmall"
              style={{
                color:
                  recon.differenceCents == null
                    ? theme.colors.onSecondaryContainer
                    : recon.isReconciled
                      ? good
                      : theme.colors.error,
              }}>
              {recon.differenceCents == null
                ? t('statements.reconcileNeedsBalance')
                : recon.isReconciled
                  ? t('statements.reconciled')
                  : t('statements.reconcileDifference', { amount: money(recon.differenceCents) })}
            </Text>
          </View>
        ) : null}

        <Card mode="outlined">
          {(reconciling ? view.reconcilable : view.inPeriod).length === 0 ? (
            <Card.Content>
              <Text variant="bodyMedium" style={[muted, styles.empty]}>
                {t('statements.noTransactions')}
              </Text>
            </Card.Content>
          ) : (
            (reconciling ? view.reconcilable : view.inPeriod).map((tx) => {
              const amount = formatSignedCents(tx.amountCents, account.currency, locale);
              const description = [
                shortDate(tx.date),
                tx.status === 'pending' ? t('transactionStatuses.pending') : null,
              ]
                .filter(Boolean)
                .join(' · ');
              return reconciling ? (
                <TouchableRipple
                  key={tx.id}
                  onPress={() =>
                    repos.transactions.update(tx.id, { isReconciled: !tx.isReconciled })
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: tx.isReconciled }}
                  accessibilityLabel={`${tx.payee}, ${amount}, ${description}`}>
                  <View style={styles.txRow}>
                    <Checkbox.Android
                      status={tx.isReconciled ? 'checked' : 'unchecked'}
                      importantForAccessibility="no"
                    />
                    <View style={styles.flex}>
                      <Text variant="bodyLarge" numberOfLines={1}>
                        {tx.payee}
                      </Text>
                      <Text variant="bodySmall" style={muted}>
                        {description}
                      </Text>
                    </View>
                    <Text variant="bodyLarge">{amount}</Text>
                  </View>
                </TouchableRipple>
              ) : (
                <List.Item
                  key={tx.id}
                  title={tx.payee}
                  description={description}
                  onPress={() =>
                    router.push({ pathname: '/transaction/[id]', params: { id: tx.id } })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`${tx.payee}, ${amount}, ${description}`}
                  left={(props) =>
                    tx.isReconciled ? <List.Icon {...props} icon="check-circle-outline" /> : null
                  }
                  right={() => <Text style={styles.value}>{amount}</Text>}
                  style={styles.item}
                />
              );
            })
          )}
        </Card>
      </ScrollView>

      <Portal>
        <Dialog visible={draft != null} onDismiss={() => setDraft(null)}>
          <Dialog.Title>{t('statements.editTitle')}</Dialog.Title>
          {draft && draftErrors ? (
            <Dialog.ScrollArea style={styles.dialogArea}>
              <ScrollView contentContainerStyle={styles.dialogContent}>
                <TextInput
                  mode="outlined"
                  label={t('statements.closingBalance')}
                  accessibilityLabel={t('statements.closingBalance')}
                  value={draft.closing}
                  onChangeText={(closing) => setDraft({ ...draft, closing })}
                  keyboardType="decimal-pad"
                  error={draftErrors.closing}
                />
                <HelperText type={draftErrors.closing ? 'error' : 'info'}>
                  {draftErrors.closing
                    ? t('statements.errors.amount')
                    : t('statements.closingHelp', { amount: money(view.computedClosingCents) })}
                </HelperText>
                <TextInput
                  mode="outlined"
                  label={t('statements.minimumPayment')}
                  accessibilityLabel={t('statements.minimumPayment')}
                  value={draft.minimum}
                  onChangeText={(minimum) => setDraft({ ...draft, minimum })}
                  keyboardType="decimal-pad"
                  error={draftErrors.minimum}
                />
                <HelperText type={draftErrors.minimum ? 'error' : 'info'}>
                  {draftErrors.minimum
                    ? t('statements.errors.amount')
                    : t('statements.minimumHelp')}
                </HelperText>
                <DateField
                  label={t('statements.dueDate')}
                  value={draft.dueDate}
                  onChange={(dueDate) => setDraft({ ...draft, dueDate })}
                  error={draftErrors.dueDate ? t('statements.errors.date') : undefined}
                />
                <TextInput
                  mode="outlined"
                  label={t('statements.notes')}
                  accessibilityLabel={t('statements.notes')}
                  value={draft.notes}
                  onChangeText={(notes) => setDraft({ ...draft, notes })}
                  multiline
                />
              </ScrollView>
            </Dialog.ScrollArea>
          ) : null}
          <Dialog.Actions>
            <Button onPress={() => setDraft(null)}>{t('common.cancel')}</Button>
            <Button onPress={saveDraft}>{t('common.save')}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16, gap: 12, paddingBottom: 48 },
  card: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 32 },
  item: { minHeight: 48, paddingHorizontal: 0 },
  value: { alignSelf: 'center' },
  button: { minHeight: 44 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingLeft: 8 },
  banner: { borderRadius: 12, padding: 12, gap: 6 },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, minHeight: 56 },
  empty: { textAlign: 'center', padding: 16 },
  dialogArea: { maxHeight: 520, paddingHorizontal: 24 },
  dialogContent: { paddingVertical: 8, gap: 4 },
});
