import type { MD3Theme } from 'react-native-paper';

/**
 * Chart colours from the dataviz reference palette: one series = categorical slot 1 (blue),
 * stepped separately for light and dark surfaces; a hairline track behind bars in the app's
 * border slate. (The brand's royal blue is too dark for chart marks: it fails the validator's
 * lightness band, so marks use this validated blue from the same family.)
 */
export function chartColors(theme: MD3Theme) {
  return theme.dark
    ? { series: '#3987e5', emphasis: '#86b6ef', track: '#1E293B' }
    : { series: '#2a78d6', emphasis: '#184f95', track: '#E2E8F0' };
}
