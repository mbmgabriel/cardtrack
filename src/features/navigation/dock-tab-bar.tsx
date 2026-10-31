import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export type DockTab = { label: string; activeIcon: IconName };

type Props = BottomTabBarProps & {
  /** Icon and label per route name. */
  tabs: Readonly<Record<string, DockTab>>;
  addLabel: string;
  onAdd: () => void;
};

const DOCK_HEIGHT = 62;
const INSET = 4;
const GAP_BELOW = 8;
// The leading edge of the highlight moves briskly, the trailing edge follows softly: it
// stretches toward the new tab and settles there.
const LEAD = { damping: 20, stiffness: 260, mass: 0.6 };
const TRAIL = { damping: 22, stiffness: 140, mass: 0.8 };
const POP = { damping: 14, stiffness: 220 };

/**
 * Space the floating dock covers at the bottom of the screen. Tab pages pad their scrolling
 * content by this much so the last row can scroll clear of the bar.
 */
export function useDockInset(): number {
  const insets = useSafeAreaInsets();
  return DOCK_HEIGHT + Math.max(insets.bottom, GAP_BELOW) + 24;
}

/** Android resizes the window for the keyboard; the dock would ride up on top of it. */
function useKeyboardShown() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}

/** Liquid Glass when the system has it and the user hasn't asked to reduce transparency. */
function useGlass(): boolean {
  const supported =
    Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (!supported) return;
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduce);
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduce);
    return () => sub.remove();
  }, [supported]);
  return supported && !reduce;
}

/** A glass capsule, or a frosted solid one where glass isn't available. */
function Surface({
  glass,
  style,
  children,
}: {
  glass: boolean;
  style: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const theme = useTheme();
  if (glass) {
    return (
      <GlassView glassEffectStyle="regular" isInteractive style={style}>
        {children}
      </GlassView>
    );
  }
  return (
    <View
      style={[
        style,
        styles.solid,
        {
          backgroundColor: theme.dark ? 'rgba(36,36,40,0.96)' : 'rgba(255,255,255,0.96)',
          borderColor: theme.colors.outlineVariant,
          shadowColor: theme.colors.shadow,
        },
      ]}>
      {children}
    </View>
  );
}

/**
 * A floating tab bar in the manner of Apple Music on iOS 26: a glass capsule over the content
 * with a soft pill gliding (and stretching) to the selected tab, which takes the accent colour,
 * and the add button in its own glass circle beside it.
 */
export function DockTabBar({
  state,
  emitter,
  navigateToTab,
  insets,
  tabs,
  addLabel,
  onAdd,
}: Props) {
  const theme = useTheme();
  const glass = useGlass();
  const reduceMotion = useReducedMotion();
  const keyboardShown = useKeyboardShown();
  const [tabWidth, setTabWidth] = useState(0);
  const left = useSharedValue(0);
  const right = useSharedValue(0);
  const previous = useSharedValue(state.index);

  useEffect(() => {
    if (tabWidth === 0) return;
    const start = state.index * tabWidth;
    const end = start + tabWidth;
    if (reduceMotion) {
      left.set(start);
      right.set(end);
    } else {
      const movingRight = state.index > previous.get();
      left.set(withSpring(start, movingRight ? TRAIL : LEAD));
      right.set(withSpring(end, movingRight ? LEAD : TRAIL));
    }
    previous.set(state.index);
  }, [state.index, tabWidth, reduceMotion, left, right, previous]);

  const highlight = useAnimatedStyle(() => ({
    left: left.value + INSET,
    width: Math.max(0, right.value - left.value - INSET * 2),
  }));

  if (keyboardShown) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, GAP_BELOW) }]}>
      <Surface glass={glass} style={styles.dock}>
        <View
          role="tablist"
          style={styles.tabs}
          onLayout={(e) => setTabWidth(e.nativeEvent.layout.width / state.routes.length)}>
          {tabWidth > 0 ? (
            <Animated.View
              style={[styles.highlight, { backgroundColor: theme.colors.onSurface }, highlight]}
            />
          ) : null}
          {state.routes.map((route, index) => {
            const tab = tabs[route.name];
            if (!tab) return null;
            const focused = index === state.index;
            return (
              <DockItem
                key={route.key}
                tab={tab}
                focused={focused}
                onPress={() => {
                  const event = emitter.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !event.defaultPrevented) {
                    void Haptics.selectionAsync();
                    navigateToTab(route.key);
                  }
                }}
                onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              />
            );
          })}
        </View>
      </Surface>
      <AddButton glass={glass} label={addLabel} onPress={onAdd} />
    </View>
  );
}

function DockItem({
  tab,
  focused,
  onPress,
  onLongPress,
}: {
  tab: DockTab;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const theme = useTheme();
  const active = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    active.set(withSpring(focused ? 1 : 0, POP));
  }, [focused, active]);
  // Like Music: the selected tab takes the accent, the rest stay in ink.
  const color = focused ? theme.colors.primary : theme.colors.onSurface;

  return (
    <Pressable
      role="tab"
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={tab.label}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.item}>
      <Lift progress={active}>
        <MaterialCommunityIcons
          // Like Music: every icon filled; the selected one takes the accent.
          name={tab.activeIcon}
          size={25}
          color={color}
        />
      </Lift>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.label, { color }]}>
        {tab.label}
      </Text>
    </Pressable>
  );
}

/** Nudges the selected tab's icon up and a little larger. */
function Lift({ progress, children }: { progress: SharedValue<number>; children: ReactNode }) {
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [0, -1]) },
      { scale: interpolate(progress.value, [0, 1], [1, 1.08]) },
    ],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function AddButton({
  glass,
  label,
  onPress,
}: {
  glass: boolean;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const pressed = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(pressed.value, [0, 1], [1, 0.9]) },
      { rotate: `${interpolate(pressed.value, [0, 1], [0, 90])}deg` },
    ],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={() => pressed.set(withSpring(1, POP))}
      onPressOut={() => pressed.set(withSpring(0, POP))}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}>
      <Surface glass={glass} style={styles.add}>
        <Animated.View style={style}>
          <MaterialCommunityIcons name="plus" size={30} color={theme.colors.onSurface} />
        </Animated.View>
      </Surface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  dock: { flex: 1, height: DOCK_HEIGHT, borderRadius: DOCK_HEIGHT / 2 },
  tabs: { flex: 1, flexDirection: 'row' },
  solid: {
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
  },
  // A faint ink capsule behind the selected tab, as on the system glass bar.
  highlight: {
    position: 'absolute',
    top: INSET,
    bottom: INSET,
    borderRadius: (DOCK_HEIGHT - INSET * 2) / 2,
    opacity: 0.1,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1, paddingHorizontal: 2 },
  label: { fontSize: 10, fontWeight: '600', letterSpacing: 0.1 },
  add: {
    width: DOCK_HEIGHT,
    height: DOCK_HEIGHT,
    borderRadius: DOCK_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
