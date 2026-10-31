import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import type { Account } from '@/db/schema';
import { cardArtUri } from '@/features/card-art/card-art';
import { readableTextColor } from '@/utils/color';

type ThumbAccount = Pick<Account, 'color'> & Partial<Pick<Account, 'imagePath' | 'last4'>>;

const SIZES = {
  sm: { width: 30, height: 20, radius: 4 },
  md: { width: 46, height: 30, radius: 6 },
  lg: { width: 56, height: 38, radius: 8 },
} as const;

/**
 * A small picture of an account's card, wherever one is listed: its colour, or its custom
 * artwork when it has some, so a card looks the same on every screen. Decorative; the row it
 * sits in names the account.
 */
export function CardThumb({
  account,
  size = 'md',
  showDigits = false,
}: {
  account: ThumbAccount;
  size?: keyof typeof SIZES;
  /** Print the last 4 digits in the corner (large thumbnails only). */
  showDigits?: boolean;
}) {
  const art = cardArtUri(account.imagePath);
  const fg = art ? '#FFFFFF' : readableTextColor(account.color);
  const { width, height, radius } = SIZES[size];

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.card,
        { width, height, borderRadius: radius, backgroundColor: account.color },
      ]}>
      {art ? (
        <>
          <Image source={{ uri: art }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={[StyleSheet.absoluteFill, styles.scrim]} />
        </>
      ) : (
        <View style={[styles.stripe, { backgroundColor: fg }]} />
      )}
      {showDigits && account.last4 ? (
        <Text style={[styles.digits, { color: fg }]}>{account.last4}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', justifyContent: 'flex-end', alignItems: 'flex-end', padding: 5 },
  stripe: { position: 'absolute', left: 0, right: 0, top: '30%', height: 4, opacity: 0.25 },
  scrim: { backgroundColor: 'rgba(0,0,0,0.2)' },
  digits: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, opacity: 0.95 },
});
