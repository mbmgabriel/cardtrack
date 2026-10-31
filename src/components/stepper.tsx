/**
 * The step-by-step flow used for adding things (transactions, accounts, recurring charges): one
 * question per screen, sliding forward and back, with progress bars, a Back/Next bar and a short
 * "Saved" moment at the end.
 */
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { Button, Icon, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** A tap that answers the question moves on by itself, after the choice has had a moment to show. */
export const AUTO_ADVANCE_MS = 220;
/** How long "Saved" shows before the flow closes. */
export const SAVED_MS = 800;

/**
 * Where the user is in a flow and how to move. `validate` checks the current step's answers
 * before moving forward. Android's back button steps back through the flow before leaving it.
 */
export function useStepper<K extends string>({
  steps,
  initial,
  validate,
}: {
  steps: readonly K[];
  initial?: K;
  validate: (step: K) => Promise<boolean>;
}) {
  const [index, setIndex] = useState(() => Math.max(0, initial ? steps.indexOf(initial) : 0));
  // +1 moving forward, -1 moving back: decides which way the screens slide.
  const [heading, setHeading] = useState(1);
  // Steps can come and go (an account type without card details skips that step).
  const at = Math.min(index, steps.length - 1);
  const step = steps[at];

  const goTo = (target: K | number) => {
    const next = typeof target === 'number' ? target : steps.indexOf(target);
    if (next < 0 || next === at) return;
    setHeading(next > at ? 1 : -1);
    setIndex(next);
  };
  const next = async () => {
    if (!(await validate(step))) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return false;
    }
    void Haptics.selectionAsync();
    goTo(at + 1);
    return true;
  };
  const back = () => goTo(at - 1);
  const advanceSoon = () => setTimeout(() => void next(), AUTO_ADVANCE_MS);

  useEffect(() => {
    if (at === 0) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setHeading(-1);
      setIndex((i) => Math.max(0, i - 1));
      return true;
    });
    return () => sub.remove();
  }, [at]);

  return {
    step,
    index: at,
    total: steps.length,
    heading,
    last: at === steps.length - 1,
    goTo,
    next,
    back,
    advanceSoon,
  };
}

export type Stepper<K extends string> = ReturnType<typeof useStepper<K>>;

/** Progress, the sliding stage, the Back/Next bar and the "Saved" moment around a flow's steps. */
export function StepperFrame<K extends string>({
  stepper,
  header,
  children,
  saveLabel,
  onSave,
  saved,
  savedLabel,
}: {
  stepper: Stepper<K>;
  /** Stays put above the sliding steps (e.g. a live preview of the card being added). */
  header?: ReactNode;
  children: ReactNode;
  saveLabel: string;
  onSave: () => void;
  saved: boolean;
  savedLabel: string;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { step, index, total, heading, last } = stepper;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <StepProgress step={index} total={total} />
        {header}
        <View style={styles.stage}>
          <Animated.View
            key={step}
            entering={(heading > 0 ? SlideInRight : SlideInLeft).duration(280)}
            exiting={(heading > 0 ? SlideOutLeft : SlideOutRight).duration(240)}
            style={StyleSheet.absoluteFill}>
            <ScrollView
              contentContainerStyle={styles.container}
              keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          </Animated.View>
        </View>

        <View
          style={[
            styles.actions,
            { backgroundColor: theme.colors.background, borderColor: theme.colors.outlineVariant },
          ]}>
          {index > 0 ? (
            <Button
              mode="text"
              icon="arrow-left"
              onPress={stepper.back}
              contentStyle={styles.tall}
              style={styles.rounded}>
              {t('stepper.back')}
            </Button>
          ) : null}
          <Button
            mode="contained"
            icon={last ? 'check' : 'arrow-right'}
            onPress={() => (last ? onSave() : void stepper.next())}
            style={styles.primary}
            contentStyle={[styles.tall, !last && styles.iconAfter]}
            labelStyle={styles.primaryLabel}>
            {last ? saveLabel : t('stepper.next')}
          </Button>
        </View>
      </KeyboardAvoidingView>
      {saved ? <SavedOverlay label={savedLabel} /> : null}
    </SafeAreaView>
  );
}

/** One bar per step; bars up to the current step fill in as the user moves forward. */
export function StepProgress({ step, total }: { step: number; total: number }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={styles.progress}>
      <View
        style={styles.bars}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('stepper.step', { current: step + 1, total })}
        accessibilityValue={{ min: 1, max: total, now: step + 1 }}>
        {Array.from({ length: total }, (_, i) => (
          <Bar
            key={i}
            filled={i <= step}
            track={theme.colors.surfaceVariant}
            fill={theme.colors.primary}
          />
        ))}
      </View>
      <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        {t('stepper.step', { current: step + 1, total })}
      </Text>
    </View>
  );
}

function Bar({ filled, track, fill }: { filled: boolean; track: string; fill: string }) {
  const amount = useSharedValue(filled ? 1 : 0);
  useEffect(() => {
    amount.set(withTiming(filled ? 1 : 0, { duration: 320, easing: Easing.out(Easing.cubic) }));
  }, [filled, amount]);
  const style = useAnimatedStyle(() => ({ width: `${amount.value * 100}%` }));
  return (
    <View style={[styles.bar, { backgroundColor: track }]}>
      <Animated.View style={[styles.barFill, { backgroundColor: fill }, style]} />
    </View>
  );
}

/** The question each step asks, large, with an optional line under it. */
export function StepTitle({ title, hint }: { title: string; hint?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.title}>
      <Text variant="headlineMedium" accessibilityRole="header" style={styles.titleText}>
        {title}
      </Text>
      {hint ? (
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export type Tile<T extends string> = { value: T; label: string; hint?: string; icon: string };

/** Large choice tiles, two to a row, each with an icon, a name and a short line. */
export function ChoiceTiles<T extends string>({
  options,
  value,
  onPick,
}: {
  options: readonly Tile<T>[];
  value: T;
  onPick: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.tiles} accessibilityRole="radiogroup">
      {options.map((option, i) => {
        const selected = option.value === value;
        return (
          <Animated.View
            key={option.value}
            entering={FadeIn.delay(i * 25).duration(220)}
            style={styles.tileCell}>
            <Pressable
              onPress={() => onPick(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              accessibilityHint={option.hint}
              style={({ pressed }) => [
                styles.tile,
                {
                  backgroundColor: selected
                    ? theme.colors.primaryContainer
                    : theme.colors.elevation.level1,
                  borderColor: selected ? theme.colors.primary : theme.colors.outlineVariant,
                },
                pressed && styles.pressed,
              ]}>
              <View
                style={[
                  styles.tileIcon,
                  {
                    backgroundColor: selected
                      ? theme.colors.primary
                      : theme.colors.secondaryContainer,
                  },
                ]}>
                <MaterialCommunityIcons
                  name={option.icon as IconName}
                  size={20}
                  color={selected ? theme.colors.onPrimary : theme.colors.onSecondaryContainer}
                />
              </View>
              <Text variant="titleSmall" numberOfLines={1}>
                {option.label}
              </Text>
              {option.hint ? (
                <Text
                  variant="bodySmall"
                  numberOfLines={2}
                  style={{ color: theme.colors.onSurfaceVariant }}>
                  {option.hint}
                </Text>
              ) : null}
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

/** The review step's summary card: a headline, then lines that jump back to their step. */
export function Receipt({ headline, children }: { headline?: ReactNode; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.receipt,
        {
          backgroundColor: theme.colors.elevation.level2,
          borderColor: theme.colors.outlineVariant,
        },
      ]}>
      {headline ? (
        <>
          {headline}
          <View style={[styles.rule, { borderColor: theme.colors.outlineVariant }]} />
        </>
      ) : null}
      {children}
    </View>
  );
}

export function ReceiptLine({
  icon,
  leading,
  label,
  onPress,
}: {
  icon?: string;
  leading?: ReactNode;
  label: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('stepper.change', { field: label })}
      style={({ pressed }) => [styles.receiptLine, pressed && styles.pressed]}>
      <View style={styles.receiptLead}>
        {leading ?? (
          <Icon source={icon ?? 'circle'} size={20} color={theme.colors.onSurfaceVariant} />
        )}
      </View>
      <Text variant="bodyLarge" style={styles.flex} numberOfLines={1}>
        {label}
      </Text>
      <Icon source="pencil-outline" size={16} color={theme.colors.onSurfaceVariant} />
    </Pressable>
  );
}

/** Shown for a moment after saving, before the flow closes. */
export function SavedOverlay({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      style={[styles.overlay, { backgroundColor: theme.colors.background }]}
      accessibilityLiveRegion="assertive"
      accessibilityLabel={label}>
      <Animated.View
        entering={ZoomIn.springify().damping(12)}
        style={[styles.check, { backgroundColor: theme.colors.primary }]}>
        <Icon source="check" size={44} color={theme.colors.onPrimary} />
      </Animated.View>
      <Animated.View entering={FadeIn.delay(120)}>
        <Text variant="titleLarge">{label}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stage: { flex: 1, overflow: 'hidden' },
  container: { padding: 20, gap: 16, paddingBottom: 32 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tall: { minHeight: 52 },
  rounded: { borderRadius: 16 },
  primary: { flex: 1, borderRadius: 16 },
  iconAfter: { flexDirection: 'row-reverse' },
  primaryLabel: { fontSize: 16, fontWeight: '600' },
  progress: { paddingHorizontal: 20, paddingTop: 8, gap: 8 },
  bars: { flexDirection: 'row', gap: 6 },
  bar: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2 },
  title: { gap: 6, marginBottom: 8 },
  titleText: { fontWeight: '700', letterSpacing: -0.5 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  tileCell: { width: '50%', padding: 5 },
  tile: { borderRadius: 18, borderWidth: 2, padding: 14, gap: 6, minHeight: 116 },
  tileIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  pressed: { opacity: 0.75 },
  receipt: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 4,
  },
  rule: { borderTopWidth: 1, borderStyle: 'dashed', marginBottom: 4 },
  receiptLine: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  receiptLead: { width: 30, alignItems: 'center' },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  check: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
