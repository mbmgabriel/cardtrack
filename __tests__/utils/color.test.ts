import { contrastRatio, readableTextColor, relativeLuminance } from '@/utils/color';
import { ACCOUNT_COLORS } from '@/features/accounts/colors';

describe('color', () => {
  it('computes WCAG luminance and contrast', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21);
  });

  it('picks black or white text', () => {
    expect(readableTextColor('#1565C0')).toBe('#FFFFFF');
    expect(readableTextColor('#FFEB3B')).toBe('#000000');
  });

  it('every tile colour meets WCAG AA with its text colour', () => {
    for (const color of ACCOUNT_COLORS) {
      expect(contrastRatio(color, readableTextColor(color))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
