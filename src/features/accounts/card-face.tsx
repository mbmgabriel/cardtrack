import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Text } from 'react-native-paper';

import type { Account } from '@/db/schema';
import { cardArtUri } from '@/features/card-art/card-art';
import { readableTextColor } from '@/utils/color';

type CardLook = Pick<Account, 'name' | 'type' | 'network' | 'institution' | 'last4' | 'color'> & {
  /** Custom artwork (Pro), relative to the documents folder. */
  imagePath?: string | null;
};

type Props = {
  account: CardLook;
  /** Shown when the name is still empty (e.g. while adding a card). */
  placeholder?: string;
  /** Small label at the top left, e.g. "Due Nov 2". */
  badge?: string | null;
  /** Scale for the type: 1 for a full-width card, smaller for previews. */
  scale?: number;
  /**
   * For cards in a stack, where only the top edge may show: the name goes on the top line beside
   * the network (and the badge moves to the bottom), so every band says whose card it is.
   */
  nameOnTop?: boolean;
  /** Shown big in place of the name wordmark, e.g. the card's balance in the wallet. */
  amount?: { value: string; label: string };
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/**
 * One account drawn as a real card: its name as a big wordmark, a chip, the network wordmark and
 * the last four digits. Decorative only; whoever shows it supplies the spoken label.
 */
export function CardFace({
  account,
  placeholder,
  badge,
  scale = 1,
  nameOnTop = false,
  amount,
  style,
  children,
}: Props) {
  const { t } = useTranslation();
  const art = cardArtUri(account.imagePath);
  // Over artwork the text is always white, on a soft dark wash so it stays readable.
  const fg = art ? '#FFFFFF' : readableTextColor(account.color);
  const name = account.name.trim() || placeholder || '';
  const brand =
    account.network && account.network !== 'other'
      ? t(`networks.${account.network}`)
      : account.institution;

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      style={[styles.card, { backgroundColor: account.color, padding: 22 * scale }, style]}>
      {art ? (
        <>
          <Image source={{ uri: art }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={[StyleSheet.absoluteFill, styles.scrim]} />
        </>
      ) : (
        // A soft sheen gives the flat colour some depth, like a printed card.
        <View style={[styles.glow, { backgroundColor: fg }]} />
      )}
      <View style={styles.topRow}>
        {nameOnTop ? (
          <Text style={[styles.topName, { color: fg }]} numberOfLines={1}>
            {name}
          </Text>
        ) : badge ? (
          <Text
            style={[
              styles.badge,
              { color: fg, borderColor: fg, fontSize: 12 * Math.max(scale, 0.8) },
            ]}>
            {badge}
          </Text>
        ) : (
          <View />
        )}
        {brand ? (
          <Text style={[styles.brand, { color: fg, fontSize: 20 * scale }]} numberOfLines={1}>
            {brand}
          </Text>
        ) : null}
      </View>

      {amount ? (
        <View>
          <Text
            style={[styles.amount, { color: fg, fontSize: 34 * scale, lineHeight: 40 * scale }]}
            numberOfLines={1}
            adjustsFontSizeToFit>
            {amount.value}
          </Text>
          <Text style={[styles.amountLabel, { color: fg }]}>{amount.label}</Text>
        </View>
      ) : (
        <View style={styles.middle}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.4}
            style={[
              styles.wordmark,
              {
                color: fg,
                fontSize: 54 * scale,
                lineHeight: 60 * scale,
                opacity: account.name.trim() ? 1 : 0.45,
              },
            ]}>
            {name}
          </Text>
          <View style={[styles.chip, { borderColor: fg, top: 12 * scale, transform: [{ scale }] }]}>
            <View style={[styles.chipLineH, { backgroundColor: fg }]} />
            <View style={[styles.chipLineV, { backgroundColor: fg }]} />
          </View>
        </View>
      )}

      <View style={styles.bottomRow}>
        <Text style={[styles.digits, { color: fg, fontSize: 15 * scale }]}>
          {account.last4 ? `••••  ${account.last4}` : t(`accountTypes.${account.type}`)}
        </Text>
        {nameOnTop && badge ? (
          <Text style={[styles.badge, { color: fg, borderColor: fg, fontSize: 12 }]}>{badge}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    aspectRatio: 1.586,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    top: -200,
    right: -120,
    opacity: 0.07,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  middle: { justifyContent: 'center' },
  scrim: { backgroundColor: 'rgba(0,0,0,0.28)' },
  amount: { fontWeight: '700', letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  amountLabel: { fontSize: 13, fontWeight: '500', opacity: 0.75 },
  topName: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2, flexShrink: 1 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { fontWeight: '900', letterSpacing: -2, textTransform: 'uppercase' },
  chip: {
    position: 'absolute',
    left: 4,
    width: 40,
    height: 30,
    borderRadius: 7,
    borderWidth: 1.5,
    opacity: 0.55,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipLineH: { position: 'absolute', left: 0, right: 0, height: 1.5 },
  chipLineV: { position: 'absolute', top: 0, bottom: 0, width: 1.5 },
  brand: { fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.5, flexShrink: 1 },
  digits: { fontWeight: '600', letterSpacing: 2, opacity: 0.85 },
  badge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
    fontWeight: '600',
  },
});
