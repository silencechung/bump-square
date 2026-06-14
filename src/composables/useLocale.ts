import { ref, watch } from 'vue';

/**
 * UI locale for the annotation help popover. Same shape as useAnnotations —
 * module-scoped refs shared across the header toggle and the overlay loader.
 * Not in Pinia: locale is a UI preference, not part of the workspace state
 * synced through `~/.bump-square/workspace.json`.
 */

export type Locale = 'zh-TW' | 'en';
export const LOCALES: readonly Locale[] = ['zh-TW', 'en'] as const;

const STORAGE_KEY = 'bump-square:locale';
const DEFAULT_LOCALE: Locale = 'zh-TW';

function readStoredLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'en' || v === 'zh-TW' ? v : DEFAULT_LOCALE;
}

const locale = ref<Locale>(readStoredLocale());

if (typeof window !== 'undefined') {
  watch(locale, (next) => {
    window.localStorage.setItem(STORAGE_KEY, next);
  });
}

export function useLocale() {
  return {
    locale,
    setLocale(next: Locale) { locale.value = next; },
    toggleLocale() {
      locale.value = locale.value === 'zh-TW' ? 'en' : 'zh-TW';
    },
  };
}
