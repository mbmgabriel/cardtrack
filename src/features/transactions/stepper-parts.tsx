import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';

import type { Account } from '@/db/schema';
import { CardThumb } from '@/features/accounts/card-thumb';

/** One account as a selectable row: a card thumbnail, its name and last digits. */
export function AccountRow({
  account,
  selected,
  onPress,
}: {
  account: Account;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const typeLabel = t(`accountTypes.${account.type}`);
  const detail = [
    account.last4 ? `•• ${account.last4}` : null,
    typeLabel.toLowerCase() === account.name.toLowerCase() ? null : typeLabel,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <ChoiceRowShell
      selected={selected}
      onPress={onPress}
      accessibilityLabel={[
        account.name,
        account.last4 ? t('accounts.endingIn', { last4: account.last4 }) : null,
      ]
        .filter(Boolean)
        .join(', ')}
      leading={<CardThumb account={account} />}
      title={account.name}
      detail={detail}
    />
  );
}

/** The "none of my accounts" choice in the same row style. */
export function NoneRow({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <ChoiceRowShell
      selected={selected}
      onPress={onPress}
      accessibilityLabel={label}
      leading={
        <View style={[styles.thumb, styles.noneThumb, { borderColor: theme.colors.outline }]}>
          <Icon source="close" size={14} color={theme.colors.onSurfaceVariant} />
        </View>
      }
      title={label}
      detail={detail}
    />
  );
}

function ChoiceRowShell({
  selected,
  onPress,
  accessibilityLabel,
  leading,
  title,
  detail,
}: {
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  leading: ReactNode;
  title: string;
  detail?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected ? theme.colors.secondaryContainer : 'transparent',
        },
        pressed && styles.pressed,
      ]}>
      {leading}
      <View style={styles.flex}>
        <Text variant="titleSmall" numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text
            variant="bodySmall"
            numberOfLines={1}
            style={{ color: theme.colors.onSurfaceVariant }}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Icon
        source={selected ? 'check-circle' : 'circle-outline'}
        size={22}
        color={selected ? theme.colors.primary : theme.colors.outlineVariant}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 60,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  thumb: { width: 46, height: 30, borderRadius: 6, overflow: 'hidden' },
  thumbSm: { width: 30, height: 20, borderRadius: 4, overflow: 'hidden' },
  thumbStripe: { position: 'absolute', left: 0, right: 0, top: '30%', height: 4, opacity: 0.25 },
  noneThumb: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.75 },
});
