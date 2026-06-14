import { useWorkspaceStore } from '~src/stores/workspace';
import { getString, type StringKey } from '~src/i18n';

/**
 * Reactive lookup against the central i18n dict. Returns a function `t(key)`
 * that reads `store.locale` at call time, so changing the locale (via
 * `store.toggleLocale()` → /api/state setLocale → SSE re-emit) re-renders
 * every component using `t()`.
 *
 * Call in templates / computed only — calling `t('foo')` in a plain `const`
 * stale-snapshots at first read because the locale ref isn't tracked.
 *
 * Usage:
 *   const t = useT();
 *   // template: {{ t('header.save') }}
 *
 * Key autocomplete + typo detection come from `StringKey` (= `keyof typeof
 * zhTW`), so `t('foo')` won't compile if no such key exists in the dict.
 */
export function useT() {
  const store = useWorkspaceStore();
  return (key: StringKey): string => getString(store.locale, key);
}
