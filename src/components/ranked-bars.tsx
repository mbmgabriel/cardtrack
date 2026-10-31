import { StyleSheet, View } from 'react-native';
import { Icon, Text, TouchableRipple, useTheme } from 'react-native-paper';

import { chartColors } from './chart-colors';

export type RankedBar = {
  key: string;
  label: string;
  /** Formatted amount, e.g. "$70.00". */
  value: string;
  share: number;
  /** Bar length relative to the largest row (0–1). */
  ratio: number;
  icon?: string;
  detail?: string;
  onPress?: () => void;
};

/**
 * Ranked horizontal bars, largest first, in one hue: the reader compares lengths on a shared
 * baseline. Every row prints its name, amount and share, so nothing depends on colour.
 */
export function RankedBars({ rows, locale }: { rows: readonly RankedBar[]; locale: string }) {
  const theme = useTheme();
  const colors = chartColors(theme);
  const percent = (ratio: number) =>
    new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(ratio);

  return (
    <View style={styles.list}>
      {rows.map((row) => {
        const share = percent(row.share);
        const label = [row.label, row.value, share, row.detail].filter(Boolean).join(', ');
        const content = (
          <View style={styles.row}>
            <View style={styles.header}>
              {row.icon ? (
                <Icon source={row.icon} size={18} color={theme.colors.onSurfaceVariant} />
              ) : null}
              <Text variant="bodyMedium" style={styles.label} numberOfLines={1}>
                {row.label}
              </Text>
              <Text variant="bodyMedium">{row.value}</Text>
              <Text
                variant="bodySmall"
                style={[styles.share, { color: theme.colors.onSurfaceVariant }]}>
                {share}
              </Text>
            </View>
            <View style={[styles.track, { backgroundColor: colors.track }]}>
              <View
                style={[
                  styles.bar,
                  { backgroundColor: colors.series, width: `${Math.max(1, row.ratio * 100)}%` },
                ]}
              />
            </View>
            {row.detail ? (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {row.detail}
              </Text>
            ) : null}
          </View>
        );
        return row.onPress ? (
          <TouchableRipple
            key={row.key}
            onPress={row.onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={styles.touch}>
            {content}
          </TouchableRipple>
        ) : (
          <View key={row.key} accessible accessibilityLabel={label} style={styles.touch}>
            {content}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 4 },
  touch: { borderRadius: 8, minHeight: 44, justifyContent: 'center' },
  row: { gap: 4, paddingVertical: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { flex: 1 },
  share: { minWidth: 36, textAlign: 'right' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  // Rounded data end, anchored at the baseline.
  bar: { height: 8, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
});
