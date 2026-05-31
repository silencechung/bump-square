/**
 * Lightweight CSRF guard for state-mutating endpoints. bump-square runs on
 * localhost with no auth, so a malicious page the user visits could otherwise
 * POST cross-origin to mutate/delete their board.
 *
 * Modern browsers send `Sec-Fetch-Site` on fetches: same-origin app calls are
 * `same-origin`; a cross-site attacker's request is `cross-site`/`same-site`.
 * Server-side callers (the MCP bridge, curl, tests) send no such header → allowed.
 * (Modern-browser-only is an accepted project constraint.)
 */
export function crossOriginBlocked(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  return site !== null && site !== 'same-origin';
}
