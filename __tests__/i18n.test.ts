import i18n, { DEFAULT_LOCALE, resolveDeviceLocale } from '@/i18n';

describe('resolveDeviceLocale', () => {
  it('maps French devices to fr-CA', () => {
    expect(resolveDeviceLocale('fr')).toBe('fr-CA');
  });

  it('falls back to en-CA for other or missing languages', () => {
    expect(resolveDeviceLocale('en')).toBe('en-CA');
    expect(resolveDeviceLocale('es')).toBe('en-CA');
    expect(resolveDeviceLocale(null)).toBe(DEFAULT_LOCALE);
  });
});

describe('fr-CA fallback', () => {
  it('uses en-CA strings until fr-CA is translated', () => {
    expect(i18n.getFixedT('fr-CA')('tabs.home')).toBe('Home');
  });
});
