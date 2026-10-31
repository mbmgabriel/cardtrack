import { useTranslation } from 'react-i18next';

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from './index';

/** The active app locale, for number/date formatting and parsing. */
export function useLocale(): SupportedLocale {
  const { i18n } = useTranslation();
  return (SUPPORTED_LOCALES as readonly string[]).includes(i18n.language)
    ? (i18n.language as SupportedLocale)
    : DEFAULT_LOCALE;
}
