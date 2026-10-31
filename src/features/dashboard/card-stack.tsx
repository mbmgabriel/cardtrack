import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Icon, Text, useTheme } from 'react-native-paper';

import { DEFAULT_DUE_DAY_OFFSET, nextDueDate, parseISODate } from '@/domain/dates';
import { splitFormattedCents } from '@/domain/money';
import type { AccountWithSummary } from '@/features/accounts/account-summaries';
import { CardFace } from '@/features/accounts/card-face';

import { stackLayout } from './card-stack-layout';
import { usePrivateMoney } from './privacy';
import { useCountUp } from './use-count-up';

const CARD_RATIO = 1.586;
const SPRING = { damping: 18, stiffness: 170, mass: 0.9 };
/** Cards in the pocket lean a little, alternately, like real cards dropped into a wallet. */
const TILTS = [-4, 3, -2.5, 3.5, -3, 2];

const POCKET_HEIGHT = 214;
/** How far the pocket's mouth dips between its two raised corners. */
const MOUTH_DIP = 22;
const POCKET_RADIUS = 30;

type Pocket = {
  /** "Total owed", "Owed on TD Visa"… */
  label: string;
  cents: number;
  currency: string;
  details: readonly string[];
};

type Props = {
  items: readonly AccountWithSummary[];
  /** The raised card, or null with every card in the stack. */
  focusedId: string | null;
  onFocus: (accountId: string | null) => void;
  onOpen: (accountId: string) => void;
  pocket: Pocket;
  hidden: boolean;
  onToggleHidden: () => void;
  today: string;
  locale: string;
};

/**
 * The wallet: cards leaning in a dark pocket that holds the total. With every card in the pocket,
 * each shows a band of its face and its own balance; tapping one raises it out upright and in
 * full (the rest line up under it as bands that stay tappable; see `stackLayout`) and everything
 * below follows that card. Tapping the raised card opens it; tapping a band raises that card.
 */
export function CardStack({
  items,
  focusedId,
  onFocus,
  onOpen,
  pocket,
  hidden,
  onToggleHidden,
  today,
  locale,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const pocketWidth = width - 32;
  const cardWidth = Math.min(width - 56, 420);
  const cardHeight = cardWidth / CARD_RATIO;
  const count = items.length;
  // A single card is always the raised one.
  const raised = count === 1 ? items[0].account.id : focusedId;
  const raisedIndex = items.findIndex((i) => i.account.id === raised);
  const { tops, pocketTop } = stackLayout(count, raisedIndex < 0 ? null : raisedIndex, cardHeight);

  return (
    <View style={[styles.wrap, { height: pocketTop + POCKET_HEIGHT }]}>
      {items.map((item, index) => (
        <StackCard
          key={item.account.id}
          item={item}
          top={tops[index]}
          // Lean only while every card is in the pocket; a raised card and its line stand straight.
          tilt={raised == null ? TILTS[index % TILTS.length] : 0}
          // The raised card sits above the rest; otherwise later cards sit in front.
          z={item.account.id === raised ? count + 1 : index}
          width={cardWidth}
          raised={item.account.id === raised}
          tucked={raised != null && item.account.id !== raised}
          today={today}
          locale={locale}
          onPress={() => {
            if (item.account.id === raised) {
              onOpen(item.account.id);
            } else {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onFocus(item.account.id);
            }
          }}
        />
      ))}
      <PocketView
        top={pocketTop}
        width={pocketWidth}
        pocket={pocket}
        hidden={hidden}
        onToggleHidden={onToggleHidden}
        locale={locale}
        showAll={count > 1 && raised != null}
        onShowAll={() => {
          void Haptics.selectionAsync();
          onFocus(null);
        }}
        background={theme.colors.inverseSurface}
        foreground={theme.colors.inverseOnSurface}
        t={t}
      />
    </View>
  );
}

function StackCard({
  item: { account, summary },
  top,
  tilt,
  z,
  width,
  raised,
  tucked,
  today,
  locale,
  onPress,
}: {
  item: AccountWithSummary;
  top: number;
  /** Degrees; 0 stands the card upright. */
  tilt: number;
  z: number;
  width: number;
  raised: boolean;
  /** Lined up under a raised card: a touch smaller, as if further back. */
  tucked: boolean;
  today: string;
  locale: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const { money, spoken } = usePrivateMoney(locale);
  const y = useSharedValue(top);
  const depth = useSharedValue(tucked ? 1 : 0);
  const angle = useSharedValue(tilt);
  useEffect(() => {
    const to = (value: number) => (reduceMotion ? value : withSpring(value, SPRING));
    y.set(to(top));
    depth.set(to(tucked ? 1 : 0));
    angle.set(to(tilt));
  }, [top, tucked, tilt, y, depth, angle, reduceMotion]);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: y.value },
      { rotate: `${angle.value}deg` },
      { scale: 1 - depth.value * 0.04 },
    ],
  }));

  const due =
    summary.isLiability && account.statementDay != null
      ? nextDueDate(today, account.statementDay, account.dueDayOffset ?? DEFAULT_DUE_DAY_OFFSET)
      : null;
  const dueLabel = due
    ? t('dashboard.cardDue', {
        date: new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(
          parseISODate(due.dueDate),
        ),
      })
    : null;
  const percent = (ratio: number) =>
    new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(ratio);
  const label = summary.isLiability ? t('accounts.owed') : t('accounts.balance');
  const a11y = [
    account.name,
    account.last4 ? t('accounts.endingIn', { last4: account.last4 }) : null,
    `${label} ${spoken(summary.balanceCents, account.currency)}`,
    summary.availableCreditCents != null
      ? t('accounts.available', { amount: spoken(summary.availableCreditCents, account.currency) })
      : null,
    summary.utilization != null
      ? t('accounts.utilization', { percent: percent(summary.utilization) })
      : null,
    dueLabel,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Animated.View style={[styles.card, { width, zIndex: z, elevation: z + 1 }, style]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityHint={raised ? t('dashboard.openCard') : t('dashboard.raiseCard')}
        accessibilityState={{ selected: raised }}
        style={({ pressed }) => pressed && styles.pressed}>
        <CardFace
          account={account}
          badge={dueLabel}
          nameOnTop
          amount={{ value: money(summary.balanceCents, account.currency), label }}
        />
      </Pressable>
    </Animated.View>
  );
}

/**
 * The pocket's outline: rounded at the bottom, with two raised corners at the top and a soft
 * scoop between them where the cards slide in.
 */
function pocketPath(width: number, height: number) {
  const r = POCKET_RADIUS;
  const ear = width * 0.17;
  const curve = 34;
  return Skia.PathBuilder.Make()
    .moveTo(0, r)
    .quadTo(0, 0, r, 0)
    .lineTo(ear, 0)
    .cubicTo(ear + curve * 0.6, 0, ear + curve * 0.4, MOUTH_DIP, ear + curve, MOUTH_DIP)
    .lineTo(width - ear - curve, MOUTH_DIP)
    .cubicTo(width - ear - curve * 0.4, MOUTH_DIP, width - ear - curve * 0.6, 0, width - ear, 0)
    .lineTo(width - r, 0)
    .quadTo(width, 0, width, r)
    .lineTo(width, height - r)
    .quadTo(width, height, width - r, height)
    .lineTo(r, height)
    .quadTo(0, height, 0, height - r)
    .close()
    .build();
}

function PocketView({
  top,
  width,
  pocket,
  hidden,
  onToggleHidden,
  locale,
  showAll,
  onShowAll,
  background,
  foreground,
  t,
}: {
  top: number;
  width: number;
  pocket: Pocket;
  hidden: boolean;
  onToggleHidden: () => void;
  locale: string;
  showAll: boolean;
  onShowAll: () => void;
  background: string;
  foreground: string;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const shown = useCountUp(pocket.cents);
  const { money, spoken } = usePrivateMoney(locale);
  const { whole, fraction, suffix } = hidden
    ? { whole: money(0, pocket.currency), fraction: '', suffix: '' }
    : splitFormattedCents(money(shown, pocket.currency), locale);

  return (
    // The scoop is see-through, so taps there reach the card behind it.
    <View pointerEvents="box-none" style={[styles.pocket, { top, height: POCKET_HEIGHT }]}>
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path path={pocketPath(width, POCKET_HEIGHT)} color={background} />
      </Canvas>
      {/* The pocket's body takes its own taps, so they never fall through to a hidden card. */}
      <View style={styles.body} onStartShouldSetResponder={() => true} />

      <View pointerEvents="box-none" style={styles.content}>
        <View pointerEvents="box-none" style={styles.pocketTop}>
          <Text
            style={[styles.pocketLabel, { color: foreground }]}
            numberOfLines={1}
            accessibilityRole="header">
            {pocket.label}
          </Text>
          {showAll ? (
            <Pressable
              onPress={onShowAll}
              accessibilityRole="button"
              accessibilityLabel={t('dashboard.backToAll')}
              hitSlop={8}
              style={({ pressed }) => [
                styles.allPill,
                { borderColor: foreground },
                pressed && styles.pressed,
              ]}>
              <Icon source="cards-outline" size={14} color={foreground} />
              <Text style={[styles.allPillText, { color: foreground }]}>
                {t('dashboard.allCards')}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Text
          style={[styles.pocketAmount, { color: foreground }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          accessibilityLabel={`${pocket.label} ${spoken(pocket.cents, pocket.currency)}`}>
          {whole}
          <Text style={[styles.pocketFraction, { color: foreground }]}>{fraction}</Text>
          {suffix}
        </Text>
        {hidden
          ? null
          : pocket.details.slice(0, 2).map((line) => (
              <Text
                key={line}
                style={[styles.pocketDetail, { color: foreground }]}
                numberOfLines={1}>
                {line}
              </Text>
            ))}
      </View>

      <Pressable
        onPress={onToggleHidden}
        accessibilityRole="switch"
        accessibilityState={{ checked: hidden }}
        accessibilityLabel={t('dashboard.hideBalance')}
        style={({ pressed }) => [
          styles.hide,
          { borderColor: foreground },
          pressed && styles.pressed,
        ]}>
        <Icon source={hidden ? 'eye-off-outline' : 'eye-outline'} size={18} color={foreground} />
        <Text style={[styles.hideText, { color: foreground }]}>
          {hidden ? t('dashboard.showBalance') : t('dashboard.hideBalance')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16 },
  card: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: 28,
    // A soft shadow along each card's top edge separates the bands in the stack.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  pressed: { opacity: 0.85 },
  pocket: { position: 'absolute', left: 0, right: 0, zIndex: 100, elevation: 100 },
  body: { position: 'absolute', top: MOUTH_DIP, left: 0, right: 0, bottom: 0 },
  content: {
    position: 'absolute',
    top: MOUTH_DIP + 16,
    left: 22,
    right: 22,
    gap: 2,
  },
  pocketTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pocketLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    opacity: 0.75,
    flexShrink: 1,
  },
  allPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    minHeight: 30,
    opacity: 0.9,
  },
  allPillText: { fontSize: 12, fontWeight: '700' },
  pocketAmount: { fontSize: 42, lineHeight: 50, fontWeight: '800', letterSpacing: -1.5 },
  pocketFraction: { fontSize: 26, fontWeight: '700', opacity: 0.55 },
  pocketDetail: { fontSize: 13, opacity: 0.7 },
  hide: {
    position: 'absolute',
    left: 22,
    right: 22,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderStyle: 'dashed',
    opacity: 0.85,
  },
  hideText: { fontSize: 14, fontWeight: '600' },
});
