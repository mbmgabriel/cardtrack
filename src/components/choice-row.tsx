import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export type Choice<T extends string> = { value: T; label: string; icon?: string };

type Props<T extends string> = {
  /** Spoken name of the group (the row itself has no visible title). */
  label: string;
  options: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
};

/**
 * Single choice as one row of compact pills that scrolls sideways, so long lists (types,
 * categories) take one line instead of a wall of chips. The selected pill is kept in view.
 */
export function ChoiceRow<T extends string>({ label, options, value, onChange }: Props<T>) {
  const theme = useTheme();
  const scroll = useRef<ScrollViewInstance>(null);
  const positions = useRef(new Map<string, number>());

  useEffect(() => {
    const x = positions.current.get(value);
    if (x != null) scroll.current?.scrollTo({ x: Math.max(0, x - 24), animated: true });
  }, [value]);

  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      contentContainerStyle={styles.row}>
      {options.map((option) => {
        const selected = option.value === value;
        const fg = selected ? theme.colors.onSecondaryContainer : theme.colors.onSurfaceVariant;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            onLayout={(e) => {
              const { x } = e.nativeEvent.layout;
              positions.current.set(option.value, x);
              // Opened with a choice already made (editing, remembered payee): show it.
              if (selected) scroll.current?.scrollTo({ x: Math.max(0, x - 24), animated: false });
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            hitSlop={{ top: 4, bottom: 4 }}
            style={({ pressed }) => [
              styles.pill,
              selected
                ? { backgroundColor: theme.colors.secondaryContainer, borderColor: 'transparent' }
                : { borderColor: theme.colors.outlineVariant },
              pressed && styles.pressed,
            ]}>
            <View style={styles.inner}>
              {option.icon ? (
                <MaterialCommunityIcons name={option.icon as IconName} size={16} color={fg} />
              ) : null}
              <Text
                variant="labelLarge"
                style={{ color: selected ? fg : theme.colors.onSurface }}
                numberOfLines={1}>
                {option.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 16 },
  // 40pt tall plus the 4pt hit slop above and below = a 48pt target.
  pill: {
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pressed: { opacity: 0.7 },
});
