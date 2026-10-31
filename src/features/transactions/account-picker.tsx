import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Icon, Text, useTheme } from 'react-native-paper';

import type { Account } from '@/db/schema';
import { cardArtUri } from '@/features/card-art/card-art';
import { readableTextColor } from '@/utils/color';

type Props = {
  label: string;
  accounts: readonly Account[];
  value: string;
  onChange: (accountId: string) => void;
  /** Offer a leading "none" tile with this label (value ''). */
  noneLabel?: string;
};

const SPRING = { damping: 16, stiffness: 240 };

/** Choose an account from a sideways row of small cards in each account's colour. */
export function AccountPicker({ label, accounts, value, onChange, noneLabel }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      contentContainerStyle={styles.row}>
      {noneLabel ? (
        <NoneTile label={noneLabel} selected={value === ''} onPress={() => onChange('')} />
      ) : null}
      {accounts.map((account) => (
        <MiniCard
          key={account.id}
          account={account}
          selected={account.id === value}
          onPress={() => onChange(account.id)}
        />
      ))}
    </ScrollView>
  );
}

/** Springs to full size when selected; the rest sit back slightly. */
function useSelectedStyle(selected: boolean) {
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    progress.set(withSpring(selected ? 1 : 0, SPRING));
  }, [selected, progress]);
  return useAnimatedStyle(() => ({
    opacity: 0.55 + progress.value * 0.45,
    transform: [{ scale: 0.94 + progress.value * 0.06 }],
  }));
}

function MiniCard({
  account,
  selected,
  onPress,
}: {
  account: Account;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const art = cardArtUri(account.imagePath);
  // Same look as the wallet's cards: white text over artwork, readable text on plain colour.
  const fg = art ? '#FFFFFF' : readableTextColor(account.color);
  const motion = useSelectedStyle(selected);
  const brand =
    account.network && account.network !== 'other' ? t(`networks.${account.network}`) : null;
  const typeLabel = t(`accountTypes.${account.type}`);
  // Last 4 digits, else the kind of account, unless that just repeats the name ("Chequing").
  const detail = account.last4
    ? `•• ${account.last4}`
    : typeLabel.toLowerCase() === account.name.toLowerCase()
      ? ''
      : typeLabel;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={[
        account.name,
        account.last4 ? t('accounts.endingIn', { last4: account.last4 }) : null,
      ]
        .filter(Boolean)
        .join(', ')}>
      <Animated.View
        style={[
          styles.ring,
          { borderColor: selected ? theme.colors.primary : 'transparent' },
          motion,
        ]}>
        <View style={[styles.card, { backgroundColor: account.color }]}>
          {art ? (
            <>
              <Image source={{ uri: art }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <View style={[StyleSheet.absoluteFill, styles.scrim]} />
            </>
          ) : (
            <View style={[styles.sheen, { backgroundColor: fg }]} />
          )}
          <View style={styles.top}>
            <Text numberOfLines={1} style={[styles.name, { color: fg }]}>
              {account.name}
            </Text>
            {brand ? (
              <Text numberOfLines={1} style={[styles.brand, { color: fg }]}>
                {brand}
              </Text>
            ) : null}
          </View>
          <View style={styles.bottom}>
            <Text variant="labelSmall" numberOfLines={1} style={[styles.detail, { color: fg }]}>
              {detail}
            </Text>
            {selected ? <Icon source="check-circle" size={16} color={fg} /> : null}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function NoneTile({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const motion = useSelectedStyle(selected);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}>
      <Animated.View
        style={[
          styles.ring,
          { borderColor: selected ? theme.colors.primary : 'transparent' },
          motion,
        ]}>
        <View style={[styles.card, styles.none, { borderColor: theme.colors.outline }]}>
          <Icon source="close" size={18} color={theme.colors.onSurfaceVariant} />
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            {label}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const CARD_W = 124;
const CARD_H = 76;

const styles = StyleSheet.create({
  row: { gap: 6, paddingHorizontal: 12 },
  ring: { borderWidth: 2, borderRadius: 16, padding: 2 },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 12,
    padding: 10,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  sheen: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    top: -70,
    right: -50,
    opacity: 0.1,
  },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { flex: 1, fontSize: 13, fontWeight: '800' },
  brand: { fontSize: 11, fontWeight: '900', fontStyle: 'italic' },
  scrim: { backgroundColor: 'rgba(0,0,0,0.28)' },
  detail: { opacity: 0.85, flexShrink: 1 },
  none: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
});
