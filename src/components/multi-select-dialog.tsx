import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';
import { Button, Checkbox, Dialog, Portal } from 'react-native-paper';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  visible: boolean;
  title: string;
  options: readonly Option<T>[];
  selected: readonly T[];
  onDismiss: () => void;
  onApply: (selected: T[]) => void;
};

/** Checkbox list in a dialog; changes apply only when the user taps Apply. */
export function MultiSelectDialog<T extends string>(props: Props<T>) {
  return (
    <Portal>
      {/* Mount the body only while open so it starts from the current selection each time. */}
      {props.visible ? <MultiSelectBody {...props} /> : null}
    </Portal>
  );
}

function MultiSelectBody<T extends string>({
  title,
  options,
  selected,
  onDismiss,
  onApply,
}: Props<T>) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<T[]>([...selected]);
  const toggle = (value: T) =>
    setDraft((d) => (d.includes(value) ? d.filter((v) => v !== value) : [...d, value]));

  return (
    <Dialog visible onDismiss={onDismiss}>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.ScrollArea style={styles.area}>
        <ScrollView>
          {options.map((option) => (
            <Checkbox.Item
              key={option.value}
              label={option.label}
              status={draft.includes(option.value) ? 'checked' : 'unchecked'}
              onPress={() => toggle(option.value)}
              mode="android"
              position="leading"
              labelStyle={styles.label}
              accessibilityLabel={option.label}
            />
          ))}
        </ScrollView>
      </Dialog.ScrollArea>
      <Dialog.Actions>
        <Button onPress={() => setDraft([])}>{t('common.clear')}</Button>
        <Button onPress={onDismiss}>{t('common.cancel')}</Button>
        <Button onPress={() => onApply(draft)}>{t('common.apply')}</Button>
      </Dialog.Actions>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  area: { maxHeight: 420, paddingHorizontal: 0 },
  label: { textAlign: 'left' },
});
