import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, StyleSheet, View } from 'react-native';
import { Button, HelperText, Text } from 'react-native-paper';

import { parseISODate, toISODate } from '@/domain/dates';
import { useLocale } from '@/i18n/use-locale';

type Props = {
  label: string;
  value: string;
  onChange: (isoDate: string) => void;
  error?: string;
};

/** Date input showing the native picker (compact on iOS, dialog on Android). */
export function DateField({ label, value, onChange, error }: Props) {
  const locale = useLocale();
  const date = parseISODate(value);
  const display = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);

  return (
    <View>
      <View style={styles.row}>
        <Text variant="bodyLarge" style={styles.label}>
          {label}
        </Text>
        {Platform.OS === 'ios' ? (
          <DateTimePicker
            value={date}
            mode="date"
            display="compact"
            locale={locale}
            accessibilityLabel={label}
            onValueChange={(_, d) => onChange(toISODate(d))}
          />
        ) : (
          <Button
            mode="outlined"
            accessibilityLabel={`${label}, ${display}`}
            contentStyle={styles.button}
            onPress={() =>
              DateTimePickerAndroid.open({
                value: date,
                mode: 'date',
                onValueChange: (_, d) => onChange(toISODate(d)),
              })
            }>
            {display}
          </Button>
        )}
      </View>
      {error ? <HelperText type="error">{error}</HelperText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { flexShrink: 1 },
  button: { minHeight: 44 },
});
