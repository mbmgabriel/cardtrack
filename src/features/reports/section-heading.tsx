import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

/** A numbered report section: the question it answers, and the answer in one line. */
export function SectionHeading({
  step,
  title,
  answer,
}: {
  step: number;
  title: string;
  answer?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={[styles.step, { backgroundColor: theme.colors.inverseSurface }]}>
          <Text style={[styles.stepText, { color: theme.colors.inverseOnSurface }]}>{step}</Text>
        </View>
        <Text variant="titleLarge" accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
      </View>
      {answer ? (
        <Text variant="bodyLarge" style={[styles.answer, { color: theme.colors.onSurfaceVariant }]}>
          {answer}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  step: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 13, fontWeight: '800' },
  title: { fontWeight: '800', letterSpacing: -0.4 },
  answer: { marginLeft: 36 },
});
