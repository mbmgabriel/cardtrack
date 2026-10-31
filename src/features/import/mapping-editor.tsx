import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Switch, Text, TouchableRipple, useTheme } from 'react-native-paper';

import { ChipSelect } from '@/components/chip-select';
import { columnCount, DATE_FORMATS, type ColumnMapping } from '@/domain/csv';

type Props = {
  rows: readonly string[][];
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
};

/** Column pickers for the import wizard. Each column is labelled with its header or a sample. */
export function MappingEditor({ rows, mapping, onChange }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const width = columnCount(rows);
  const headerRow = rows[0] ?? [];
  const firstData = rows[mapping.hasHeader ? 1 : 0] ?? [];
  const columns = Array.from({ length: width }, (_, i) => {
    // The column's name when the file has one, otherwise its first value.
    const label = (mapping.hasHeader ? headerRow[i] : '') || firstData[i] || '';
    const sample = label.length > 18 ? `${label.slice(0, 17)}…` : label;
    return {
      value: String(i),
      label: sample
        ? t('import.column', { n: i + 1, sample })
        : t('import.columnEmpty', { n: i + 1 }),
    };
  });
  const set = (patch: Partial<ColumnMapping>) => onChange({ ...mapping, ...patch });
  const split = mapping.amountCol == null;

  const toggle = (label: string, value: boolean, onToggle: () => void, help?: string) => (
    <TouchableRipple
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={help}
      accessibilityState={{ checked: value }}>
      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <Text variant="bodyLarge">{label}</Text>
          {help ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {help}
            </Text>
          ) : null}
        </View>
        <Switch value={value} onValueChange={onToggle} importantForAccessibility="no" />
      </View>
    </TouchableRipple>
  );

  const columnSelect = (label: string, value: number | null, onPick: (col: number) => void) => (
    <ChipSelect
      label={label}
      value={value == null ? '' : String(value)}
      onChange={(v) => onPick(Number(v))}
      options={columns}
    />
  );

  return (
    <View style={styles.container}>
      {toggle(t('import.hasHeader'), mapping.hasHeader, () =>
        set({ hasHeader: !mapping.hasHeader }),
      )}
      {columnSelect(t('import.dateCol'), mapping.dateCol, (dateCol) => set({ dateCol }))}
      <ChipSelect
        label={t('import.dateFormat')}
        value={mapping.dateFormat}
        onChange={(dateFormat) => set({ dateFormat })}
        options={DATE_FORMATS.map((f) => ({ value: f, label: f }))}
      />
      {columnSelect(t('import.payeeCol'), mapping.payeeCol, (payeeCol) => set({ payeeCol }))}
      <ChipSelect
        label={t('import.amountMode')}
        value={split ? 'split' : 'single'}
        onChange={(mode) =>
          set(
            mode === 'single'
              ? { amountCol: mapping.debitCol ?? 0, debitCol: null, creditCol: null }
              : {
                  amountCol: null,
                  debitCol: mapping.amountCol ?? 0,
                  creditCol: Math.min(width - 1, (mapping.amountCol ?? 0) + 1),
                },
          )
        }
        options={[
          { value: 'single', label: t('import.amountSingle') },
          { value: 'split', label: t('import.amountSplit') },
        ]}
      />
      {split ? (
        <>
          {columnSelect(t('import.debitCol'), mapping.debitCol, (debitCol) => set({ debitCol }))}
          {columnSelect(t('import.creditCol'), mapping.creditCol, (creditCol) =>
            set({ creditCol }),
          )}
        </>
      ) : (
        columnSelect(t('import.amountCol'), mapping.amountCol, (amountCol) => set({ amountCol }))
      )}
      {toggle(
        t('import.invertSign'),
        mapping.invertSign,
        () => set({ invertSign: !mapping.invertSign }),
        t('import.invertSignHelp'),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { gap: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
});
