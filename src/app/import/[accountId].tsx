import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  Checkbox,
  Chip,
  Dialog,
  Icon,
  List,
  Portal,
  RadioButton,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChipSelect } from '@/components/chip-select';
import { EmptyState } from '@/components/empty-state';
import { repos } from '@/db';
import { useLiveData } from '@/db/live';
import { applyMapping, parseCsvRows, type ColumnMapping } from '@/domain/csv';
import { parseISODate } from '@/domain/dates';
import { categoryLabel } from '@/features/categories/category-label';
import { useCategories, useCategoryMap } from '@/features/categories/use-categories';
import { useAccount } from '@/features/accounts/use-accounts';
import { runDailyJobs } from '@/features/background/daily-jobs';
import { guessMapping } from '@/features/import/guess-mapping';
import { MappingEditor } from '@/features/import/mapping-editor';
import { planImport, toImportInput, type ImportPlan } from '@/features/import/plan-import';
import { MAPPING_PRESETS, presetForInstitution } from '@/features/import/presets';
import { formatSignedCents } from '@/features/transactions/transaction-row';
import { useLocale } from '@/i18n/use-locale';

const CSV_TYPES = [
  'text/csv',
  'text/comma-separated-values',
  'application/csv',
  'text/plain',
  // Some Android file providers label CSV files as Excel.
  'application/vnd.ms-excel',
];
const PREVIEW_ROWS = 10;
const SAVED = 'saved';
const GUESS = 'guess';

type Step = 'pick' | 'map' | 'review' | 'done';

export default function ImportScreen() {
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const current = useAccount(accountId);
  const categories = useCategories();
  const categoryMap = useCategoryMap();
  const batches = useLiveData(
    () => repos.imports.listByAccount(accountId),
    ['import_batches', 'transactions'],
  );

  const [step, setStep] = useState<Step>('pick');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<string[][]>([]);
  const [source, setSource] = useState<string>(GUESS);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [categoryFor, setCategoryFor] = useState<Map<number, string | null>>(new Map());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [picking, setPicking] = useState<{ lines: number[]; value: string } | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [result, setResult] = useState<{ batchId: string; added: number; skipped: number } | null>(
    null,
  );

  if (!current) {
    return <EmptyState icon="credit-card-off-outline" message={t('accounts.notFound')} />;
  }
  const { account } = current;
  const saved = repos.csvMappings.findForInstitution(account.institution);
  const muted = { color: theme.colors.onSurfaceVariant };
  const shortDate = (iso: string) =>
    new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(
      parseISODate(iso),
    );
  const money = (cents: number) => formatSignedCents(cents, account.currency, locale);

  const mappingFor = (key: string, fileRows: string[][]): ColumnMapping => {
    if (key === SAVED && saved) return saved;
    const preset = MAPPING_PRESETS.find((p) => p.id === key);
    return preset ? preset.mapping : guessMapping(fileRows);
  };

  const pickFile = async () => {
    try {
      const picked = await getDocumentAsync({ type: CSV_TYPES, copyToCacheDirectory: true });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      const fileRows = parseCsvRows(await new File(asset.uri).text());
      if (fileRows.length === 0) {
        Alert.alert(t('import.title'), t('import.empty'));
        return;
      }
      const start = saved ? SAVED : (presetForInstitution(account.institution)?.id ?? GUESS);
      setFileName(asset.name);
      setRows(fileRows);
      setSource(start);
      setMapping(mappingFor(start, fileRows));
      setStep('map');
    } catch {
      Alert.alert(t('import.title'), t('import.unreadable'));
    }
  };

  const mapped = mapping ? applyMapping(rows, mapping) : { rows: [], problems: [] };

  const toReview = () => {
    const next = planImport(mapped.rows, {
      accountId,
      accountType: account.type,
      existingHashes: repos.transactions.dedupeHashes(accountId),
      categoryMemory: repos.transactions.categoryMemory(),
    });
    setPlan(next);
    setCategoryFor(new Map(next.fresh.map((r) => [r.line, r.categoryId])));
    setSelected(new Set());
    setStep('review');
  };

  const runImport = () => {
    if (!plan || !mapping) return;
    try {
      const batch = repos.imports.create({
        accountId,
        fileName,
        skippedDuplicates: plan.duplicates.length,
        rows: plan.fresh.map((r) => toImportInput(r, accountId, categoryFor.get(r.line) ?? null)),
      });
      const presetName =
        MAPPING_PRESETS.find((p) => p.id === source)?.name ?? saved?.name ?? account.institution;
      repos.csvMappings.save(account.institution, presetName, mapping);
      runDailyJobs();
      setResult({ batchId: batch.id, added: batch.rowCount, skipped: batch.skippedDuplicates });
      setStep('done');
    } catch (e) {
      Alert.alert(t('common.saveFailed'), e instanceof Error ? e.message : String(e));
    }
  };

  const confirmUndo = () => {
    if (!undoing) return;
    repos.imports.undo(undoing);
    if (result?.batchId === undoing) router.back();
    setUndoing(null);
  };

  const toggleSelected = (line: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });

  const applyCategory = () => {
    if (!picking) return;
    setCategoryFor((m) => {
      const next = new Map(m);
      for (const line of picking.lines) next.set(line, picking.value === '' ? null : picking.value);
      return next;
    });
    setSelected(new Set());
    setPicking(null);
  };

  const sourceOptions = [
    ...(saved
      ? [{ value: SAVED, label: t('import.presetSaved', { institution: account.institution }) }]
      : []),
    ...MAPPING_PRESETS.map((p) => ({ value: p.id, label: p.name })),
    { value: GUESS, label: t('import.presetGuess') },
  ];

  const undoDialog = (
    <Portal>
      <Dialog visible={undoing != null} onDismiss={() => setUndoing(null)}>
        <Dialog.Title>{t('import.undoTitle')}</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">
            {t('import.undoBody', {
              count: undoing ? repos.imports.countTransactions(undoing) : 0,
            })}
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => setUndoing(null)}>{t('common.cancel')}</Button>
          <Button textColor={theme.colors.error} onPress={confirmUndo}>
            {t('import.undo')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );

  const screen = <Stack.Screen options={{ title: t('import.title'), presentation: 'modal' }} />;

  if (step === 'pick') {
    return (
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.flex}>
        {screen}
        <ScrollView
          contentContainerStyle={styles.container}
          contentInsetAdjustmentBehavior="automatic">
          <Text variant="bodyMedium" style={muted}>
            {t('import.intro')}
          </Text>
          <Button
            mode="contained"
            icon="file-upload-outline"
            onPress={() => void pickFile()}
            contentStyle={styles.button}>
            {t('import.choose')}
          </Button>
          {batches.length > 0 ? (
            <>
              <Text variant="titleSmall" accessibilityRole="header" style={styles.section}>
                {t('import.previous')}
              </Text>
              {batches.map((b) => (
                <List.Item
                  key={b.id}
                  title={t('import.batch', {
                    file: b.fileName,
                    date: shortDate(b.importedAt.slice(0, 10)),
                  })}
                  description={t('import.batchCounts', {
                    added: b.rowCount,
                    skipped: b.skippedDuplicates,
                  })}
                  titleNumberOfLines={2}
                  left={(props) => <List.Icon {...props} icon="file-delimited-outline" />}
                  right={() => (
                    <Button onPress={() => setUndoing(b.id)} textColor={theme.colors.error}>
                      {t('import.undo')}
                    </Button>
                  )}
                  style={styles.item}
                />
              ))}
            </>
          ) : null}
        </ScrollView>
        {undoDialog}
      </SafeAreaView>
    );
  }

  if (step === 'map' && mapping) {
    const preview = rows.slice(0, PREVIEW_ROWS + (mapping.hasHeader ? 1 : 0));
    const previewResult = applyMapping(preview, mapping);
    const parsedByLine = new Map(previewResult.rows.map((r) => [r.line, r]));
    const problemByLine = new Map(previewResult.problems.map((p) => [p.line, p.reason]));
    return (
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.flex}>
        {screen}
        <ScrollView
          contentContainerStyle={styles.container}
          contentInsetAdjustmentBehavior="automatic">
          <Text variant="titleMedium" accessibilityRole="header">
            {t('import.stepMap')} · {fileName}
          </Text>
          <Text variant="bodyMedium" style={muted}>
            {t('import.stepMapHelp')}
          </Text>
          <ChipSelect
            label={t('import.preset')}
            value={source}
            onChange={(key) => {
              setSource(key);
              setMapping(mappingFor(key, rows));
            }}
            options={sourceOptions}
          />
          <MappingEditor rows={rows} mapping={mapping} onChange={setMapping} />

          <Text variant="titleSmall" accessibilityRole="header" style={styles.section}>
            {t('import.preview')}
          </Text>
          <Card mode="outlined">
            {preview.map((raw, i) => {
              const line = i + 1;
              if (mapping.hasHeader && i === 0) return null;
              const parsed = parsedByLine.get(line);
              const problem = problemByLine.get(line);
              return (
                <View key={line} style={styles.previewRow}>
                  <Text variant="bodySmall" style={muted} numberOfLines={1}>
                    {t('import.line', { line })}: {raw.join(' | ')}
                  </Text>
                  {parsed ? (
                    <View style={styles.row}>
                      <Text variant="bodyMedium" style={styles.flex} numberOfLines={1}>
                        {shortDate(parsed.date)} · {parsed.payee}
                      </Text>
                      <Text variant="bodyMedium">{money(parsed.amountCents)}</Text>
                    </View>
                  ) : (
                    <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
                      {t(`import.problem.${problem ?? 'date'}`)}
                    </Text>
                  )}
                </View>
              );
            })}
          </Card>
          <Text variant="bodyMedium">{t('import.readCount', { count: mapped.rows.length })}</Text>
          {mapped.problems.length > 0 ? (
            <Text variant="bodySmall" style={muted}>
              {t('import.problemCount', { count: mapped.problems.length })}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Button onPress={() => setStep('pick')} contentStyle={styles.button}>
              {t('import.back')}
            </Button>
            <Button
              mode="contained"
              onPress={toReview}
              disabled={mapped.rows.length === 0}
              contentStyle={styles.button}>
              {t('import.next')}
            </Button>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'review' && plan) {
    const uncategorized = plan.fresh.filter((r) => !categoryFor.get(r.line)).map((r) => r.line);
    return (
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.flex}>
        {screen}
        <FlatList
          data={plan.fresh}
          keyExtractor={(r) => String(r.line)}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.container}>
              <Text variant="titleMedium" accessibilityRole="header">
                {t('import.stepReview')}
              </Text>
              <Text variant="bodyLarge">
                {t('import.summary', {
                  fresh: plan.fresh.length,
                  duplicates: plan.duplicates.length,
                })}
              </Text>
              <Text variant="bodySmall" style={muted}>
                {plan.fresh.length === 0 ? t('import.nothingNew') : t('import.duplicatesHelp')}
              </Text>
              {plan.fresh.length > 0 ? (
                <View style={styles.chips}>
                  <Chip
                    icon="checkbox-multiple-marked-outline"
                    onPress={() => setSelected(new Set(plan.fresh.map((r) => r.line)))}
                    style={styles.chip}>
                    {t('import.selectAll')}
                  </Chip>
                  {uncategorized.length > 0 ? (
                    <Chip
                      icon="tag-off-outline"
                      onPress={() => setSelected(new Set(uncategorized))}
                      style={styles.chip}>
                      {t('import.selectUncategorized')}
                    </Chip>
                  ) : null}
                  <Chip
                    icon="tag-outline"
                    disabled={selected.size === 0}
                    onPress={() => setPicking({ lines: [...selected], value: '' })}
                    style={styles.chip}>
                    {t('import.setCategory', { count: selected.size })}
                  </Chip>
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item }) => {
            const categoryId = categoryFor.get(item.line) ?? null;
            const category = categoryId ? categoryMap.get(categoryId) : undefined;
            const checked = selected.has(item.line);
            const amount = money(item.amountCents);
            return (
              <View style={styles.reviewRow}>
                <TouchableRipple
                  onPress={() => toggleSelected(item.line)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={`${item.payee}, ${amount}, ${shortDate(item.date)}`}
                  style={styles.flex}>
                  <View style={styles.row}>
                    <Checkbox.Android
                      status={checked ? 'checked' : 'unchecked'}
                      importantForAccessibility="no"
                    />
                    <View style={styles.flex}>
                      <Text variant="bodyLarge" numberOfLines={1}>
                        {item.payee}
                      </Text>
                      <Text variant="bodySmall" style={muted}>
                        {shortDate(item.date)} · {t(`transactionTypes.${item.type}`)}
                      </Text>
                    </View>
                    <Text variant="bodyLarge">{amount}</Text>
                  </View>
                </TouchableRipple>
                <Chip
                  compact
                  icon={category?.icon ?? 'tag-outline'}
                  onPress={() => setPicking({ lines: [item.line], value: categoryId ?? '' })}
                  accessibilityLabel={`${t('import.categoryFor')}: ${
                    category ? categoryLabel(category, t) : t('transactions.uncategorized')
                  }`}
                  style={styles.categoryChip}>
                  {category ? categoryLabel(category, t) : t('transactions.uncategorized')}
                </Chip>
              </View>
            );
          }}
          ListFooterComponent={
            <View style={[styles.actions, styles.container]}>
              <Button onPress={() => setStep('map')} contentStyle={styles.button}>
                {t('import.back')}
              </Button>
              <Button
                mode="contained"
                onPress={runImport}
                disabled={plan.fresh.length === 0}
                contentStyle={styles.button}>
                {t('import.importButton', { count: plan.fresh.length })}
              </Button>
            </View>
          }
        />
        <Portal>
          <Dialog visible={picking != null} onDismiss={() => setPicking(null)}>
            <Dialog.Title>{t('import.categoryFor')}</Dialog.Title>
            <Dialog.ScrollArea style={styles.dialogArea}>
              <ScrollView>
                <RadioButton.Group
                  value={picking?.value ?? ''}
                  onValueChange={(value) => setPicking((p) => (p ? { ...p, value } : p))}>
                  <RadioButton.Item
                    value=""
                    label={t('transactions.uncategorized')}
                    mode="android"
                    position="leading"
                    labelStyle={styles.radioLabel}
                  />
                  {categories.map((c) => (
                    <RadioButton.Item
                      key={c.id}
                      value={c.id}
                      label={categoryLabel(c, t)}
                      mode="android"
                      position="leading"
                      labelStyle={styles.radioLabel}
                    />
                  ))}
                </RadioButton.Group>
              </ScrollView>
            </Dialog.ScrollArea>
            <Dialog.Actions>
              <Button onPress={() => setPicking(null)}>{t('common.cancel')}</Button>
              <Button onPress={applyCategory}>{t('common.apply')}</Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.flex}>
      {screen}
      <ScrollView
        contentContainerStyle={styles.container}
        contentInsetAdjustmentBehavior="automatic">
        <View style={styles.done} accessible accessibilityRole="text">
          <Icon source="check-circle-outline" size={48} color={theme.colors.primary} />
          <Text variant="titleMedium" style={styles.center}>
            {t('import.done', { added: result?.added ?? 0, skipped: result?.skipped ?? 0 })}
          </Text>
          {account.institution ? (
            <Text variant="bodySmall" style={[muted, styles.center]}>
              {t('import.doneHelp', { institution: account.institution })}
            </Text>
          ) : null}
        </View>
        <Button mode="contained" onPress={() => router.back()} contentStyle={styles.button}>
          {t('import.finish')}
        </Button>
        {result && result.added > 0 ? (
          <Button
            textColor={theme.colors.error}
            onPress={() => setUndoing(result.batchId)}
            contentStyle={styles.button}>
            {t('import.undo')}
          </Button>
        ) : null}
      </ScrollView>
      {undoDialog}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16, gap: 12 },
  list: { paddingBottom: 32 },
  section: { marginTop: 12 },
  button: { minHeight: 48 },
  item: { minHeight: 56 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, justifyContent: 'center' },
  reviewRow: { paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  categoryChip: { alignSelf: 'flex-start', marginLeft: 44 },
  dialogArea: { maxHeight: 420, paddingHorizontal: 0 },
  radioLabel: { textAlign: 'left' },
  done: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  center: { textAlign: 'center' },
});
