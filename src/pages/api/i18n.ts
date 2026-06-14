import type { APIRoute } from 'astro';
import { getAllStrings, getStrings, isLocale, LOCALES } from '~src/i18n';
import { getLocale } from '~src/lib/serverState';

export const prerender = false;

/** Read-only i18n snapshot. Defaults to current server locale; pass
 * ?locale=en to peek another locale, or ?all=1 to dump every locale.
 *
 * The locale state itself is broadcast via the existing SSE channel
 * (/api/events), so the UI doesn't need to poll this endpoint to react
 * to toggles — this is for external tools, debug, and the initial read
 * before the SSE handshake completes. */
export const GET: APIRoute = async ({ url }) => {
  const wantAll = url.searchParams.get('all') === '1';
  if (wantAll) {
    return json({
      activeLocale: getLocale(),
      locales: LOCALES,
      strings: getAllStrings(),
    });
  }
  const requested = url.searchParams.get('locale');
  const locale = isLocale(requested) ? requested : getLocale();
  return json({
    locale,
    strings: getStrings(locale),
  });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
