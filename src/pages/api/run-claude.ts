import type { APIRoute } from 'astro';
import { existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runClaude, isRunning } from '~src/lib/claudeRunner';
import { getState, workspacePath } from '~src/lib/serverState';
import { crossOriginBlocked } from '~src/lib/guard';

const SKILL_INSTALL_PATH = resolve(homedir(), '.claude', 'skills', 'bump-layout', 'SKILL.md');

export const prerender = false;

const PROMPTS: Record<string, (state: ReturnType<typeof getState>, deltaPath: string) => string> = {
  'generate-spec': (s, deltaPath) => {
    const frameCount = s.squares.length;
    return `/bump-layout
workspace: ${workspacePath}
deltaPath: ${deltaPath}
判斷 containment 時容忍幾個 px 的偏差(使用者在小尺寸截圖上不好精準拉線) — 但這個容差**只是內部判斷依據,不要寫進輸出的 prompt / tree 裡**。最終 markdown 的節點說明只描述「這是什麼元件、它的意圖」,不要出現座標、x/y 數字、或「幾何上 / x≈xxx」這種字眼。
目前有 ${frameCount} 個 Frame。
依各 Frame 的 containment(包含關係)與 comment(使用者意圖)產生**整份 spec**(結構 + 節點說明 + assets 推論),一次寫完。
**完成後 Write 一份 delta JSON 到 deltaPath**(**不要動 workspace.json** — server 端會把 delta 套進去,你只需要輸出新欄位即可,大幅省 output token)。Delta 格式:
\`\`\`json
{
  "tree": <StructureNode>,
  "prompt": {
    "structure": "## 結構\\n\\n\`\`\`\\n<ascii tree>\\n\`\`\`\\n\\n## 節點說明\\n\\n- **Label** type — intent…",
    "assets": "## Assets\\n\\n- **Label** — 素材需求…"
  }
}
\`\`\``;
  },
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

  // Delta-protocol: pre-generate a unique temp path; agent writes its result
  // there, server reads + merges + cleans up after `claude --print` exits.
  // Saves the 5000-7000 unchanged-token re-echo that Write-the-whole-file
  // would cost.
  const deltaPath = resolve(tmpdir(), `bump-square-spec-${randomUUID()}.json`);
  const prompt = PROMPTS[kind](getState(), deltaPath);

  // Fire-and-forget: respond 202 immediately; claude streams via /api/terminal/events.
  // Pass kind so the runner can broadcast it on status events — buttons key off
  // matching kind so only the one you pressed shows a spinner.
  runClaude(prompt, kind, deltaPath).catch((err) => console.error('[run-claude] error:', err));

  return new Response(JSON.stringify({ ok: true, running: isRunning(), kind }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
};
