import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Icon, Text, useTheme } from 'react-native-paper';

export type QuickAction = { key: string; icon: string; label: string; onPress: () => void };

/** A row of round quick actions under the wallet, each labelled underneath. */
export function QuickActions({ actions }: { actions: readonly QuickAction[] }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      {actions.map((action, i) => (
        <Animated.View key={action.key} entering={FadeIn.delay(i * 40)} style={styles.cell}>
          <Pressable
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={({ pressed }) => [styles.touch, pressed && styles.pressed]}>
            <View
              style={[
                styles.circle,
                {
                  backgroundColor: theme.colors.elevation.level1,
                  borderColor: theme.colors.outlineVariant,
                },
              ]}>
              <Icon source={action.icon} size={26} color={theme.colors.onSurface} />
            </View>
            <Text variant="labelMedium" numberOfLines={1} style={styles.label}>
              {action.label}
            </Text>
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 12 },
  cell: { flex: 1, alignItems: 'center' },
  touch: { alignItems: 'center', gap: 6, minWidth: 64 },
  circle: {
    borderWidth: 1,
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
