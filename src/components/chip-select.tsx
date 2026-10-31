import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { ChoiceRow, type Choice } from './choice-row';

type Props<T extends string> = {
  label: string;
  options: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
};

/** A labelled single choice: the label, then the options as one sideways row of pills. */
export function ChipSelect<T extends string>({ label, options, value, onChange }: Props<T>) {
  return (
    <View style={styles.container}>
      <Text variant="titleSmall" style={styles.label}>
        {label}
      </Text>
      <View style={styles.bleed}>
        <ChoiceRow label={label} options={options} value={value} onChange={onChange} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  label: { fontWeight: '600' },
  // The row scrolls edge to edge, past the screen's usual 16pt padding.
  bleed: { marginHorizontal: -16 },
});
