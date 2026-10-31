import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  ZoomIn,
} from 'react-native-reanimated';
import { Icon, Text, useTheme } from 'react-native-paper';

import {
  HIGH_UTILIZATION_THRESHOLD,
  utilizationRating,
  type UtilizationRating,
} from '@/domain/balances';
import { statusColors } from '@/theme';

import { useCountUp } from './use-count-up';

const SEGMENTS = 20;
const MIN_BAR = 10;
const MAX_BAR = 30;
/** Each bar starts a beat after the one before, so the meter fills left to right. */
const STAGGER_MS = 24;
const BOUNCE = { damping: 9, stiffness: 180 };
const GLIDE = { damping: 16, stiffness: 120 };
const BUBBLE_WIDTH = 82;

const FACES: Record<UtilizationRating, string> = {
  excellent: 'emoticon-excited-outline',
  good: 'emoticon-happy-outline',
  fair: 'emoticon-neutral-outline',
  high: 'emoticon-sad-outline',
};

type Props = {
  /** Owed ÷ limit; above 1 when over the limit. */
  ratio: number;
  /** e.g. "$575.00 available". */
  available: string;
  locale: string;
};

/**
 * Credit used as a little equalizer: bars that rise from left to right and fill in one after
 * another, a speech-bubble marker (with a face for the mood) springing to the percentage, and the
 * 30% guideline marked. Green while usage is healthy, amber when fair, red when high — the rating
 * is always written out too, so colour is never the only signal.
 */
export function UtilizationGauge({ ratio, available, locale }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const clamped = Math.min(1, Math.max(0, ratio));
  const rating = utilizationRating(ratio);
  const status = statusColors(theme);
  const tone =
    rating === 'high' ? theme.colors.error : rating === 'fair' ? status.warning : status.success;
  const shown = useCountUp(Math.round(ratio * 100));
  const percent = (value: number) =>
    new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(value);
  const filledCount = ratio <= 0 ? 0 : Math.max(1, Math.round(clamped * SEGMENTS));

  // The marker glides to the percentage; its pointer follows exactly, the bubble stays on-card.
  const x = useSharedValue(0);
  useEffect(() => {
    const target = clamped * width;
    x.set(reduceMotion ? target : withSpring(target, GLIDE));
  }, [clamped, width, x, reduceMotion]);
  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: Math.min(
          Math.max(x.value - BUBBLE_WIDTH / 2, 0),
          Math.max(0, width - BUBBLE_WIDTH),
        ),
      },
    ],
  }));
  const pointerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value - 6 }] }));

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.elevation.level1,
          borderColor: theme.colors.outlineVariant,
        },
      ]}
      accessible
      accessibilityLabel={`${t('dashboard.creditUsed')} ${percent(ratio)}, ${t(`dashboard.rating.${rating}`)}, ${available}`}>
      <View style={styles.header}>
        <View style={styles.titles}>
          <Text variant="titleMedium" style={styles.bold}>
            {t('dashboard.creditUsed')}
          </Text>
          <View style={styles.ratingRow}>
            <View style={[styles.dot, { backgroundColor: tone }]} />
            <Text variant="bodyMedium" style={{ color: tone }} numberOfLines={2}>
              {t(`dashboard.rating.${rating}`)}
            </Text>
          </View>
        </View>
        <Text style={[styles.percent, { color: theme.colors.onSurface }]}>
          {percent(shown / 100)}
        </Text>
      </View>

      <View
        style={styles.meter}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        importantForAccessibility="no-hide-descendants">
        {width > 0 ? (
          <>
            {/* Slides on the outer view, pops in on the inner one: one view can't do both. */}
            <Animated.View style={[styles.bubbleTrack, bubbleStyle]}>
              <Animated.View
                entering={reduceMotion ? undefined : ZoomIn.springify().damping(10)}
                style={[styles.bubble, { backgroundColor: theme.colors.inverseSurface }]}>
                <Icon source={FACES[rating]} size={16} color={theme.colors.inverseOnSurface} />
                <Text style={[styles.bubbleText, { color: theme.colors.inverseOnSurface }]}>
                  {percent(ratio)}
                </Text>
              </Animated.View>
            </Animated.View>
            <Animated.View
              style={[
                styles.pointer,
                { borderTopColor: theme.colors.inverseSurface },
                pointerStyle,
              ]}
            />
          </>
        ) : null}

        <View style={styles.bars}>
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <Bar
              key={i}
              index={i}
              filled={i < filledCount}
              color={tone}
              track={theme.colors.outlineVariant}
              reduceMotion={reduceMotion}
            />
          ))}
          {/* The 30% guideline, dashed across the bars. */}
          <View
            style={[
              styles.guide,
              { left: `${HIGH_UTILIZATION_THRESHOLD * 100}%`, borderColor: theme.colors.onSurface },
            ]}
          />
        </View>

        <View style={styles.scale}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            0%
          </Text>
          <View style={[styles.guideLabel, { left: `${HIGH_UTILIZATION_THRESHOLD * 100}%` }]}>
            <Icon source="flag-variant" size={12} color={theme.colors.onSurfaceVariant} />
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              30%
            </Text>
          </View>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            100%
          </Text>
        </View>
      </View>

      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        {available}
      </Text>
    </View>
  );
}

/** One bar: grey underneath, and the colour rising into it with a small bounce when filled. */
function Bar({
  index,
  filled,
  color,
  track,
  reduceMotion,
}: {
  index: number;
  filled: boolean;
  color: string;
  track: string;
  reduceMotion: boolean;
}) {
  const height = MIN_BAR + (index / (SEGMENTS - 1)) * (MAX_BAR - MIN_BAR);
  const fill = useSharedValue(0);
  useEffect(() => {
    const to = filled ? 1 : 0;
    fill.set(
      reduceMotion
        ? to
        : withDelay((filled ? index : SEGMENTS - index) * STAGGER_MS, withSpring(to, BOUNCE)),
    );
  }, [filled, index, fill, reduceMotion]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, fill.value * 1.4),
    transform: [{ scaleY: 0.35 + 0.65 * fill.value }],
  }));

  return (
    <View style={[styles.bar, { height, backgroundColor: track }]}>
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.barFill, { backgroundColor: color }, style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 28, borderWidth: 1, padding: 20, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  titles: { flex: 1, gap: 4 },
  bold: { fontWeight: '700' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  percent: { fontSize: 44, lineHeight: 50, fontWeight: '800', letterSpacing: -1.5 },
  meter: { paddingTop: 44, gap: 8 },
  bubbleTrack: { position: 'absolute', top: 0, left: 0 },
  bubble: {
    width: BUBBLE_WIDTH,
    height: 30,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  bubbleText: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  // A small triangle under the bubble, pointing at the exact percentage.
  pointer: {
    position: 'absolute',
    top: 30,
    left: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: MAX_BAR },
  bar: { flex: 1, borderRadius: 5, overflow: 'hidden' },
  barFill: { borderRadius: 5, transformOrigin: 'bottom' },
  guide: {
    position: 'absolute',
    top: -6,
    bottom: -4,
    borderLeftWidth: 1.5,
    borderStyle: 'dashed',
    opacity: 0.5,
  },
  scale: { flexDirection: 'row', justifyContent: 'space-between' },
  guideLabel: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    transform: [{ translateX: -14 }],
  },
});
