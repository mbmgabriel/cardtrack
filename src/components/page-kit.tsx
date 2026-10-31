/**
 * The app's page vocabulary, taken from the dashboard: a big bold title with round buttons, white
 * rounded panels on a soft grey page, icon tiles and roomy rows. Colour is left to the content.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, Switch, Text, useTheme } from 'react-native-paper';

export const PANEL_RADIUS = 28;

type HeaderAction = {
  icon: string;
  label: string;
  onPress: () => void;
  /** A toggle that's on (e.g. "show archived"): drawn in ink. */
  selected?: boolean;
  /** The page's main action: a dark rounded square instead of a white circle. */
  primary?: boolean;
};

/** Large page title with an optional line under it and round buttons on the right. */
export function PageHeader({
  title,
  subtitle,
  actions = [],
}: {
  title: string;
  subtitle?: string;
  actions?: readonly HeaderAction[];
}) {
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <View style={styles.flex}>
        <Text variant="headlineMedium" accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions.map((action) => (
        <RoundButton key={action.label} {...action} />
      ))}
    </View>
  );
}

/** A 48pt round (or, for the main action, rounded-square) icon button. */
export function RoundButton({
  icon,
  label,
  onPress,
  selected = false,
  primary = false,
  badge = false,
}: HeaderAction & { badge?: boolean }) {
  const theme = useTheme();
  const ink = selected || primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected ? { selected } : undefined}
      style={({ pressed }) => [
        primary ? styles.squircle : styles.round,
        ink
          ? { backgroundColor: theme.colors.inverseSurface }
          : {
              backgroundColor: theme.colors.elevation.level1,
              borderWidth: 1,
              borderColor: theme.colors.outlineVariant,
            },
        pressed && styles.pressed,
      ]}>
      <Icon
        source={icon}
        size={24}
        color={ink ? theme.colors.inverseOnSurface : theme.colors.onSurface}
      />
      {badge ? (
        <View
          style={[
            styles.badge,
            { backgroundColor: theme.colors.error, borderColor: theme.colors.elevation.level1 },
          ]}
        />
      ) : null}
    </Pressable>
  );
}

/** A white rounded panel, optionally with a bold title and a quiet note on the right. */
export function Panel({
  title,
  trailing,
  children,
  padded = true,
  style,
}: {
  title?: string;
  trailing?: string;
  children: ReactNode;
  /** Off for panels of edge-to-edge rows. */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.panel,
        padded ? styles.padded : styles.rows,
        {
          backgroundColor: theme.colors.elevation.level1,
          borderColor: theme.colors.outlineVariant,
        },
        style,
      ]}>
      {title ? (
        <View style={[styles.panelHeader, !padded && styles.panelHeaderInset]}>
          <Text variant="titleMedium" accessibilityRole="header" style={styles.bold}>
            {title}
          </Text>
          {trailing ? (
            <Text
              variant="bodySmall"
              numberOfLines={2}
              style={[styles.trailing, { color: theme.colors.onSurfaceVariant }]}>
              {trailing}
            </Text>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** An icon in a soft rounded square, the leading mark of a row. */
export function IconTile({ icon, size = 44 }: { icon: string; size?: number }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: size * 0.34,
          backgroundColor: theme.colors.surfaceVariant,
        },
      ]}>
      <Icon source={icon} size={size * 0.48} color={theme.colors.onSurface} />
    </View>
  );
}

type RowProps = {
  /** Leading tile; fact rows (label and value) go without. */
  icon?: string;
  title: string;
  description?: string;
  onPress?: () => void;
  /** A switch on the right; the whole row toggles it. */
  toggle?: { value: boolean; onToggle: () => void };
  /** Shown before the chevron, e.g. the current choice. */
  value?: string;
  destructive?: boolean;
};

/** One row in a panel: icon tile, title and description, then a switch or a chevron. */
export function ListRow({
  icon,
  title,
  description,
  onPress,
  toggle,
  value,
  destructive,
}: RowProps) {
  const theme = useTheme();
  const press = toggle ? toggle.onToggle : onPress;
  return (
    <Pressable
      onPress={press}
      disabled={!press}
      accessibilityRole={toggle ? 'switch' : 'button'}
      accessibilityState={toggle ? { checked: toggle.value } : undefined}
      accessibilityLabel={[title, description, value].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {icon ? <IconTile icon={icon} /> : null}
      <View style={styles.flex}>
        <Text
          variant="titleMedium"
          style={[styles.rowTitle, destructive && { color: theme.colors.error }]}>
          {title}
        </Text>
        {description ? (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {description}
          </Text>
        ) : null}
      </View>
      {toggle ? (
        <Switch
          value={toggle.value}
          onValueChange={toggle.onToggle}
          importantForAccessibility="no"
        />
      ) : (
        <View style={styles.trailingRow}>
          {value ? (
            <Text
              variant={press ? 'bodyMedium' : 'titleMedium'}
              style={
                press
                  ? { color: theme.colors.onSurfaceVariant }
                  : [styles.value, { color: theme.colors.onSurface }]
              }>
              {value}
            </Text>
          ) : null}
          {press ? (
            <Icon source="chevron-right" size={22} color={theme.colors.onSurfaceVariant} />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

/** A hairline between rows in a panel, indented past the icon tile (or not, for fact rows). */
export function RowDivider({ flush = false }: { flush?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.divider,
        flush && styles.dividerFlush,
        { backgroundColor: theme.colors.outlineVariant },
      ]}
    />
  );
}

/**
 * The gap between two grouped rows: the panel's white with its side borders carried through, and
 * a hairline indented past the row's icon tile.
 */
export function GroupedSeparator({ inset = 76 }: { inset?: number }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.groupGap,
        {
          backgroundColor: theme.colors.elevation.level1,
          borderColor: theme.colors.outlineVariant,
        },
      ]}>
      <View
        style={[
          styles.groupLine,
          { marginLeft: inset, backgroundColor: theme.colors.outlineVariant },
        ]}
      />
    </View>
  );
}

/** A filter or toggle pill: outlined when off, ink when on. */
export function Pill({
  label,
  icon,
  selected = false,
  onPress,
  disabled = false,
}: {
  label: string;
  icon?: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const fg = selected ? theme.colors.inverseOnSurface : theme.colors.onSurface;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [
        styles.pill,
        selected
          ? {
              backgroundColor: theme.colors.inverseSurface,
              borderColor: theme.colors.inverseSurface,
            }
          : {
              backgroundColor: theme.colors.elevation.level1,
              borderColor: theme.colors.outlineVariant,
            },
        (pressed || disabled) && styles.pressed,
      ]}>
      {icon ? <Icon source={icon} size={16} color={fg} /> : null}
      <Text variant="labelLarge" style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Corners and border for one row of a list drawn as a panel (rows are separate list items, so
 * each one rounds and borders only the edges that are the panel's). Callers add `borderColor`.
 */
export function groupedRow(index: number, count: number): ViewStyle {
  return {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopWidth: index === 0 ? 1 : 0,
    borderBottomWidth: index === count - 1 ? 1 : 0,
    borderTopLeftRadius: index === 0 ? 24 : 0,
    borderTopRightRadius: index === 0 ? 24 : 0,
    borderBottomLeftRadius: index === count - 1 ? 24 : 0,
    borderBottomRightRadius: index === count - 1 ? 24 : 0,
    overflow: 'hidden',
  };
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  title: { fontWeight: '800', letterSpacing: -0.8 },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  squircle: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
  },
  pressed: { opacity: 0.7 },
  // White on the slate canvas, edged with the soft border so stacked panels separate.
  panel: { borderRadius: PANEL_RADIUS, borderWidth: 1 },
  padded: { padding: 20, gap: 14 },
  rows: { paddingVertical: 8 },
  panelHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  panelHeaderInset: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4 },
  bold: { fontWeight: '700' },
  trailing: { flex: 1, textAlign: 'right' },
  tile: { alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  rowTitle: { fontWeight: '600' },
  trailingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  value: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 74 },
  dividerFlush: { marginLeft: 16 },
  groupGap: { marginHorizontal: 16, borderLeftWidth: 1, borderRightWidth: 1 },
  groupLine: { height: StyleSheet.hairlineWidth },
  pill: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
});
