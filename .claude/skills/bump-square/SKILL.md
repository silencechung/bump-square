---
name: bump-square
description: Operational helper for the bump-square design→intent→handoff tool. Brings up and health-checks its dev server (port 4399), verifies the page renders, and recaps the agent (claude --print) implementation workflow. Use when the user wants to start / run / 跑 / 開 bump-square, "起 dev", bring the environment up, or coordinate the design → intent structure → handoff flow. Location-agnostic: installable at user level (~/.claude/skills/) or project level (<repo>/.claude/skills/).
---

# bump-square ops

Coordination helper for **bump-square** (purpose & architecture: see the project
`CLAUDE.md`). This skill owns the **repeatable environment + verification ops**.

## When to use
- "開始 / 跑 / 開 bump-square", "起 dev", "把環境帶起來", "bring up bump-square".
- Before debugging agent runs, to confirm dev server + skill install are sane.

## Bring-up (do this in order)
1. **Health-check** — run the bundled script:
   ```bash
   bash "$SKILL_DIR/scripts/check.sh"
   ```
   It reports dev(:4399), cdp(:9222), and `~/.claude/skills/bump-layout/SKILL.md`
   install status; also locates the project dir.
2. **Dev server** — if :4399 is DOWN, start it **in the project dir** as a
   background process (do NOT block):
   ```bash
   cd <project-dir> && pnpm dev   # run_in_background: true
   ```
   Then re-check :4399 returns 200 before proceeding.
3. **`bump-layout` skill** — if `~/.claude/skills/bump-layout/SKILL.md` is missing,
   the user can install it from the app (the UI shows a one-click banner on the
   first agent action) — no manual step needed. Alternatively `curl -X POST
   http://localhost:4399/api/install-skill` triggers the same copy.
4. **Claude Code CLI** — `claude` must be on PATH and the user must have run
   `claude login` once. The dev server spawns `claude --print` per agent action;
   no `--channels`, no live session needed.

## Verify a render (optional)
If Chrome is on :9222 (cdp up), confirm the page compiled & rendered without a
Vite error overlay:
```bash
node "$SKILL_DIR/scripts/verify-render.mjs" http://localhost:4399/
```
Prints `viteError` (null = OK) plus a few presence checks. Avoid relying on a
200 alone — SSR returns 200 even if the Vue island errors client-side.

## Agent flow (recap — full version in CLAUDE.md)
Every UI action (`generate-structure` / `suggest-assets` / `handoff`) does:
1. Browser POST `/api/run-claude { kind }` (CSRF-guarded).
2. Server pre-flights `~/.claude/skills/bump-layout/SKILL.md`; if missing, returns
   `409 skill-missing` and the UI offers a one-click install banner.
3. `claudeRunner` spawns `claude --print --model sonnet --output-format
   stream-json --allowedTools Read,Write,Edit` with a `/bump-layout` prompt.
4. The agent (`claude --print`) reads `~/.bump-square/workspace.json`, does the
   work per the bump-layout skill, and writes the result back to the same file.
5. `serverState`'s `fs.watch` picks up the change and broadcasts via the
   existing `/api/events` SSE — the browser updates with no extra round-trip.
6. stream-json output is parsed by `claudeRunner.formatStreamEvent()` and pushed
   to the bottom `TerminalPanel` (xterm readonly) via `/api/terminal/events`.

Rules for the agent itself live in `skills/bump-layout/SKILL.md` (in the repo)
— in short: only touch `workspace.json` (handoff excepted), never fabricate
intent for a comment-less frame, collapse repeated substructures into "×N".

## Figma + intent implementation (the vision)
When a developer provides Figma and (optionally) a bump-square layout prompt:
- **Figma = visual truth** (colours, spacing, sizes, radii, hierarchy values).
- **bump-square = intent truth** (repetition, responsiveness, variants,
  interaction, structural meaning).
- Link the two by **matching names** (structure Frame names ↔ Figma layer names).
- Conflicts: visual dimension → Figma; behaviour/semantics → bump-square; if it
  fits neither cleanly, stop and ask. Prerequisite: Figma MCP auth + a node URL.

## Scripts
- `scripts/check.sh` — port/health report + skill-install check + project-dir detection.
- `scripts/verify-render.mjs <url>` — CDP render check (needs Chrome :9222).

`$SKILL_DIR` = this skill's directory (works the same at user or project level).
