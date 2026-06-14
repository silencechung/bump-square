import type { APIRoute } from 'astro';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { crossOriginBlocked } from '~src/lib/guard';

export const prerender = false;

/** Copy the bundled bump-layout skill from the repo into the user's
 * ~/.claude/skills/ so claude --print can find /bump-layout.
 * Idempotent: if the destination already exists, returns ok without copying. */
export const POST: APIRoute = async ({ request }) => {
  if (crossOriginBlocked(request)) {
    return new Response(JSON.stringify({ error: 'cross-origin blocked' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  const src = resolve(process.cwd(), 'skills', 'bump-layout', 'SKILL.md');
  const dst = resolve(homedir(), '.claude', 'skills', 'bump-layout', 'SKILL.md');

  if (!existsSync(src)) {
    return new Response(JSON.stringify({
      ok: false,
      error: `source skill not found at ${src}`,
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
    return new Response(JSON.stringify({ ok: true, installed: dst }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
