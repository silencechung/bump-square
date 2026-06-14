import { strings as zhTW } from './zh-TW';
import { strings as en } from './en';

/**
 * Central i18n module. Both client (`useT()` composable) and server
 * (`/api/i18n` endpoint, SSE payload) import from here — single source of
 * truth for what counts as a valid locale + what strings exist.
 */

export type Locale = 'zh-TW' | 'en';
export const LOCALES: readonly Locale[] = ['zh-TW', 'en'] as const;
export const DEFAULT_LOCALE: Locale = 'zh-TW';

export type StringKey = keyof typeof zhTW;

const dictionaries: Record<Locale, Record<StringKey, string>> = {
  'zh-TW': zhTW,
  en,
};

/** Lookup with zh-TW fallback. Used by client + server alike. */
export function getString(locale: Locale, key: StringKey): string {
  return dictionaries[locale]?.[key] ?? dictionaries[DEFAULT_LOCALE][key];
}

/** Whole dictionary for one locale (server `/api/i18n` payload, or for
 * ad-hoc client use that doesn't want the composable wrapper). */
export function getStrings(locale: Locale): Record<StringKey, string> {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

/** Every locale's dictionary, for callers that want everything in one shot. */
export function getAllStrings(): Record<Locale, Record<StringKey, string>> {
  return dictionaries;
}

export function isLocale(value: unknown): value is Locale {
  return value === 'zh-TW' || value === 'en';
}
