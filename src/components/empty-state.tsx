import { StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  icon: string;
  message: string;
};

export function EmptyState({ icon, message }: Props) {
  const theme = useTheme();
  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content} accessible accessibilityRole="text">
        <Icon source={icon} size={48} color={theme.colors.outline} />
        <Text
          variant="bodyLarge"
          style={[styles.message, { color: theme.colors.onSurfaceVariant }]}>
          {message}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  message: { textAlign: 'center' },
});
