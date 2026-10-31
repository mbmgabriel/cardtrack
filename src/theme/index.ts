import { DarkTheme as NavDark, DefaultTheme as NavLight, type Theme } from 'expo-router';
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

/**
 * The CardTrack palette. Light mode is the brand palette as given; dark mode keeps the same roles
 * on deep slate, with the accents lifted so they stay readable.
 *
 * - Canvas: crisp ultra-light slate that cuts glare.
 * - Containers: pure white with soft slate borders, so stacked cards and panels separate.
 * - Ink: dark slate for numbers, balances and headers.
 * - Accent: royal blue for actions and navigation.
 * - Success: emerald for money in, payments made and healthy credit use.
 */
export const PALETTE = {
  light: {
    canvas: '#F8FAFC',
    container: '#FFFFFF',
    border: '#E2E8F0',
    ink: '#0F172A',
    muted: '#64748B',
    subtle: '#F1F5F9',
    accent: '#1E40AF',
    accentSoft: '#DBEAFE',
    onAccentSoft: '#1E3A8A',
    success: '#15803D',
    successSoft: '#DCFCE7',
    warning: '#B45309',
  },
  dark: {
    canvas: '#0B1120',
    container: '#131C2E',
    border: '#1E293B',
    ink: '#F1F5F9',
    muted: '#94A3B8',
    subtle: '#1A2436',
    accent: '#93B4F5',
    accentSoft: '#1E3A8A',
    onAccentSoft: '#DBEAFE',
    success: '#4ADE80',
    successSoft: '#14532D',
    warning: '#FBBF24',
  },
} as const;

export type StatusColors = { success: string; successSoft: string; warning: string };

/** Green for money in and healthy usage, amber for a warning; always paired with words. */
export function statusColors(theme: Pick<MD3Theme, 'dark'>): StatusColors {
  const p = theme.dark ? PALETTE.dark : PALETTE.light;
  return { success: p.success, successSoft: p.successSoft, warning: p.warning };
}

function paperColors(base: MD3Theme, p: (typeof PALETTE)['light' | 'dark'], inverse: string) {
  return {
    ...base.colors,
    primary: p.accent,
    onPrimary: p === PALETTE.light ? '#FFFFFF' : '#0B1120',
    primaryContainer: p.accentSoft,
    onPrimaryContainer: p.onAccentSoft,
    secondaryContainer: p.accentSoft,
    onSecondaryContainer: p.onAccentSoft,
    background: p.canvas,
    onBackground: p.ink,
    surface: p.container,
    onSurface: p.ink,
    surfaceVariant: p.subtle,
    onSurfaceVariant: p.muted,
    outline: p.muted,
    outlineVariant: p.border,
    // The pocket and other "ink" objects: dark slate on light, near-white on dark.
    inverseSurface: inverse,
    inverseOnSurface: p === PALETTE.light ? '#F8FAFC' : '#0F172A',
    elevation: {
      ...base.colors.elevation,
      level1: p.container,
      level2: p === PALETTE.light ? '#FFFFFF' : '#18233A',
    },
  };
}

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: paperColors(MD3LightTheme, PALETTE.light, PALETTE.light.ink),
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: paperColors(MD3DarkTheme, PALETTE.dark, '#E2E8F0'),
};

/** Navigation theme derived from the Paper theme so headers/tab bars match. */
function toNavigationTheme(base: Theme, paper: MD3Theme): Theme {
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: paper.colors.primary,
      background: paper.colors.background,
      card: paper.colors.elevation.level2,
      text: paper.colors.onSurface,
      border: paper.colors.outlineVariant,
      notification: paper.colors.error,
    },
  };
}

export const navigationLightTheme = toNavigationTheme(NavLight, lightTheme);
export const navigationDarkTheme = toNavigationTheme(NavDark, darkTheme);

export function getThemes(scheme: 'light' | 'dark' | 'unspecified' | null | undefined) {
  return scheme === 'dark'
    ? { paper: darkTheme, navigation: navigationDarkTheme }
    : { paper: lightTheme, navigation: navigationLightTheme };
}
