import type { APIRoute } from 'astro';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { runClaude, isRunning } from '../../lib/claudeRunner';
import { getState, workspacePath } from '../../lib/serverState';
import { crossOriginBlocked } from '../../lib/guard';

const SKILL_INSTALL_PATH = resolve(homedir(), '.claude', 'skills', 'bump-layout', 'SKILL.md');

export const prerender = false;

const PROMPTS: Record<string, (state: ReturnType<typeof getState>) => string> = {
  'generate-structure': (s) => {
    const frameCount = s.squares.length;
    return `/bump-layout
workspace: ${workspacePath}
目前有 ${frameCount} 個 Frame。
依各 Frame 的 containment（包含關係）與 comment（使用者意圖）產生意圖結構樹。
完成後更新 workspace.json 的 structure 欄位（tree + prompt）。`;
  },
  'suggest-assets': (_s) =>
    `/bump-layout
workspace: ${workspacePath}
根據目前的 structure.tree 推敲每個節點需要的視覺素材。
完成後更新 workspace.json 的 structure.assetsPrompt 欄位（markdown 格式）。`,
};

export const POST: APIRoute = async ({ request }) => {
  // Localhost dev server has no auth; without this guard a malicious page the
  // user visits could POST cross-origin and trigger arbitrary `claude --print`
  // runs (RCE-equivalent on this user's machine).
  if (crossOriginBlocked(request)) {
    return new Response(JSON.stringify({ error: 'cross-origin blocked' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { kind?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 });
  }

  const { kind } = body;
  if (!kind || !(kind in PROMPTS)) {
    return new Response(JSON.stringify({ error: `unknown kind: ${kind}` }), { status: 400 });
  }

  // Pre-flight: the /bump-layout skill must exist or claude --print will just
  // print "Unknown command". Surface this as an actionable 409 so the UI can
  // offer a one-click install.
  if (!existsSync(SKILL_INSTALL_PATH)) {
    return new Response(JSON.stringify({
      error: 'skill-missing',
      message: 'bump-layout skill 尚未安裝',
      skillPath: SKILL_INSTALL_PATH,
    }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  }

  const prompt = PROMPTS[kind](getState());

  // Fire-and-forget: respond 202 immediately; claude streams via /api/terminal/events.
  // Pass kind so the runner can broadcast it on status events — buttons key off
  // matching kind so only the one you pressed shows a spinner.
  runClaude(prompt, kind).catch((err) => console.error('[run-claude] error:', err));

  return new Response(JSON.stringify({ ok: true, running: isRunning(), kind }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
};
