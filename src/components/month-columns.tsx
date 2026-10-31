import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Chip, Text, TouchableRipple, useTheme } from 'react-native-paper';

import { parseISODate } from '@/domain/dates';

import { chartColors } from './chart-colors';

type Props = {
  months: readonly { month: string; cents: number }[];
  format: (cents: number) => string;
  locale: string;
};

const PLOT_HEIGHT = 120;

/**
 * Twelve monthly columns in one hue. Tap a column to read its value (the latest month is selected
 * at first); a table view lists every month so values never depend on tapping.
 */
export function MonthColumns({ months, format, locale }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const colors = chartColors(theme);
  const [selected, setSelected] = useState(months.length - 1);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...months.map((m) => m.cents));
  const label = (month: string, style: 'short' | 'long') =>
    new Intl.DateTimeFormat(locale, {
      month: style === 'short' ? 'narrow' : 'long',
      ...(style === 'long' ? { year: 'numeric' } : {}),
    }).format(parseISODate(`${month}-01`));
  const current = months[Math.min(selected, months.length - 1)];

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        {current ? (
          <View style={styles.flex} accessibilityLiveRegion="polite">
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {label(current.month, 'long')}
            </Text>
            <Text variant="titleMedium">{format(current.cents)}</Text>
          </View>
        ) : null}
        <Chip
          compact
          selected={table}
          showSelectedOverlay
          icon={table ? 'chart-bar' : 'table'}
          onPress={() => setTable((v) => !v)}
          accessibilityState={{ selected: table }}>
          {table ? t('reports.showChart') : t('reports.showTable')}
        </Chip>
      </View>

      {table ? (
        <View>
          {months.map((m) => (
            <View key={m.month} style={styles.tableRow} accessible>
              <Text variant="bodyMedium" style={styles.flex}>
                {label(m.month, 'long')}
              </Text>
              <Text variant="bodyMedium" style={styles.tabular}>
                {format(m.cents)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.plot}>
          {months.map((m, i) => {
            const isSelected = i === selected;
            return (
              <TouchableRipple
                key={m.month}
                onPress={() => setSelected(i)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${label(m.month, 'long')}, ${format(m.cents)}`}
                style={styles.column}>
                <View style={styles.columnInner}>
                  <View style={[styles.slot, { borderBottomColor: colors.track }]}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: `${(Math.max(0, m.cents) / max) * 100}%`,
                          backgroundColor: isSelected ? colors.emphasis : colors.series,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    variant="labelSmall"
                    style={{
                      color: isSelected ? theme.colors.onSurface : theme.colors.onSurfaceVariant,
                    }}>
                    {label(m.month, 'short')}
                  </Text>
                </View>
              </TouchableRipple>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  plot: { flexDirection: 'row', gap: 2 },
  // Each column's touch target spans the full plot height (bigger than the bar).
  column: { flex: 1, borderRadius: 4 },
  columnInner: { alignItems: 'center', gap: 4 },
  slot: {
    height: PLOT_HEIGHT,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bar: { width: '70%', borderTopLeftRadius: 4, borderTopRightRadius: 4, minHeight: 0 },
  tableRow: { flexDirection: 'row', paddingVertical: 6, minHeight: 32 },
  tabular: { fontVariant: ['tabular-nums'] },
});
