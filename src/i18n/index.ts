import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import enCA from './locales/en-CA.json';
import frCA from './locales/fr-CA.json';

export const SUPPORTED_LOCALES = ['en-CA', 'fr-CA'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'en-CA';

/** Map the device language to a supported locale; French speakers get fr-CA. */
export function resolveDeviceLocale(languageCode: string | null | undefined): SupportedLocale {
  return languageCode === 'fr' ? 'fr-CA' : DEFAULT_LOCALE;
}

const i18n = createInstance();

i18n.use(initReactI18next).init({
  resources: {
    'en-CA': { translation: enCA },
    'fr-CA': { translation: frCA },
  },
  lng: resolveDeviceLocale(getLocales()[0]?.languageCode),
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
});

export default i18n;
