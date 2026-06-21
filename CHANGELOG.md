# Changelog

All notable changes to bump-square. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project is **pre-1.0 personal-tool alpha** so SemVer is loose — features
land when they're useful, breaking changes happen when the design shifts.

Dates are local (Asia/Taipei).

## [0.2.0] — 2026-06-21

The "agent only writes the delta" cut. Headline number: a single ✨ Generate
Spec run dropped from ~180s to ~60s — measured 3× speed-up — by stopping the
agent from re-echoing the unchanged ~5000-7000 tokens of `workspace.json`
every time it wrote back. Plus a schema cleanup, button consolidation,
several UX bugfixes, and HMR survivability for the in-flight agent process.

### Changed
- **Workspace schema: `structure.prompt` is now a nested object
  `{ structure, assets, suggestions }`** (was a flat string). The matching
  `structure.assetsPrompt` field is gone — assets is now `prompt.assets`.
  Versions consolidated to one stamp: `structure.promptVersion` covers both
  `structure` and `assets` sections; new `structure.suggestionsVersion` is
  reserved for the upcoming #11 Suggest button. A one-off migration
  (`migrateStructurePromptShape` in `src/lib/serverState.ts`) converts old
  workspaces on load; idempotent.
- **UI: two AI buttons → one `✨ Generate Spec`.** The 0.1.0 pair
  (🧩 Structure + ✨ Assets) collapsed into a single button because both
  always wrote into the same spec and rarely benefited from being independently
  rerunnable. `generate-structure` + `suggest-assets` agent kinds replaced by
  a single `generate-spec` that writes structure + assets in one run, shares
  one `promptVersion`. (#11 Suggest stays a separate button when it ships.)
- **Delta protocol — agent no longer writes `workspace.json` directly.**
  Server pre-generates a `/tmp/bump-square-spec-<uuid>.json` path per spawn,
  passes it in the prompt as `deltaPath:`, and reads + merges + cleans up after
  process exit (`applySpecDelta` in `src/lib/serverState.ts`). Agent only
  outputs `{ tree, prompt: { structure, assets } }` — ~3000 tokens instead of
  ~12000 — saving ~50-90s per run on sonnet. This is the single biggest perf
  fix in this release.
- **`--exclude-dynamic-system-prompt-sections` hardcoded into spawn args.**
  Stops Claude Code's per-machine sections (cwd / env / git status) from
  invalidating the Anthropic prompt cache prefix on every git change. Cache
  read = 0.1× input cost, hits on subsequent runs within the 5-min TTL.
- **Default model `sonnet`** (was `haiku` mid-0.1.x, briefly `opus`). Haiku
  reached for Bash + scripting too readily; opus was over-spec'd for this
  workload. Sonnet hits the right quality-vs-latency point given the other
  perf fixes here.
- **SKILL.md (`skills/bump-layout/SKILL.md`) tightened**:
  - Explicit "tools: Read/Write/Edit only — Bash is NOT available; don't
    write `.mjs` to `/tmp` and try to `node` it". (Resolves the recurring
    "tool error: command requires approval" loops we saw with haiku.)
  - "Compute containment with reasoning, do not write scripts" + "expected
    work = 2 tool calls".
  - Output budget rules: exactly three sections (`## 結構` / `## 節點說明` /
    `## Assets`), one-line-per-node, no `★ Insight` or extra analysis
    blocks. Saves output tokens.
  - Examples now use generic component names (Header / PrimaryButton /
    CardGrid), not one user's specific workspace.
- **CommentEditor `#tag` → `` `tag` `` autocomplete: prefix-match + subsequence
  fallback.** `` `item-cent` `` now surfaces `items-center` (singular/plural
  near-miss) even though strict prefix wouldn't match. Subsequence is a
  fallback after prefix matches; prefix still wins ordering.
- **Chip styling bumped for contrast** — was `bg-violet-500/15
  border-violet-500/40 text-violet-200` (washed out against the card's
  `bg-violet-900/25`); now `bg-violet-500/35 border-violet-300/70
  text-violet-50`. Readable in both editor (zinc background) and card view
  (violet background).
- **AnnotationOverlay scrollbar** — thin themed (`scrollbar-width: thin` +
  `::-webkit-scrollbar` width 6px, transparent track, violet thumb) instead
  of the default 16px grey gutter that clashed with the glass-morph backdrop.
- **AnnotationOverlay popover viewport-overflow detection** — popup flips
  above the trigger when below would overflow viewport bottom (same pattern
  the help annotation overlay already used).
- **TagSuggestion popup viewport-overflow detection** — same as above for the
  ``\`tag\``` autocomplete: when the caret is near the bottom of the screen
  the popup opens above instead of below, clamped to viewport.
- **Agent Events panel: per-event summary collapse/expand.** Summaries
  preserved in full in `workspace.json` but rendered with `line-clamp-3` by
  default; click anywhere on the row to toggle. Stops a single long agent
  summary from drowning the panel.

### Added
- **`applySpecDelta(delta)`** in `src/lib/serverState.ts` — partial-spec
  merger for the delta protocol. Tolerant of missing keys (agent may skip a
  section); doesn't touch fields it wasn't given.
- **`sweepZombieAgentEvents()`** + auto-sweep in `claudeRunner` module init.
  HMR survivability — when the dev server reloads `claudeRunner` mid-spawn,
  the child process's `close` handler closure is gc'd along with the module,
  so the running event would stay as a forever-spinning row and the queue
  would block. Sweep marks any in-memory "running" event as orphaned
  (`exit -1`, summary "(server restart / HMR reload — process orphaned)")
  and clears the `__bumpClaudeRunning` flag so new spawns can proceed.
- **TagSuggestion `decorationClass` override** to `bump-tag-trigger` (was
  default `.suggestion`) + explicit CSS reset, to avoid accidental browser /
  third-party styling on the suggestion trigger char.

### Fixed
- **Hand mode no longer allows frame resize.** Selected frame's 8 resize
  handles are hidden in Hand mode (only render with `drawMode`), and
  `startResize()` is gated as defense in depth. Matches the "Hand mode =
  pure pan" intent.
- **Copy-paste a frame no longer flips Frame mode → Hand mode.** Pre-fix,
  entering placement mode forced `drawMode.value = false`, leaking out as a
  mode change after every paste. `placing.value` is already checked first in
  both pointer-down paths, so the force was unnecessary.
- **Locale toggle 繁→EN→繁 flicker.** Rapid clicks could race the SSE
  acknowledgments such that an older toggle's state would overwrite a newer
  optimistic local update. `pendingLocaleDispatches` counter blocks the SSE
  apply path for `locale` while a dispatch is in flight.
- **Single-space chip ``\` \``` no longer matches the TagNode InputRule** —
  regex tightened from `` /`[^`]+`$/ `` to `` /`[^`\s]+`$/ `` to forbid
  whitespace-only content. Card-view parser updated symmetrically.

### Removed
- **`structure.assetsPrompt` field** (flat string) — migrated into
  `structure.prompt.assets` (nested).
- **`structure.assetsPromptVersion` field** — collapsed into single
  `structure.promptVersion` covering the whole spec.
- **`generate-structure` and `suggest-assets` agent kinds** — replaced by
  single `generate-spec`.
- **`header.ai.structure.*` and `header.ai.assets.*` i18n keys** — collapsed
  to `header.ai.spec.*`.

### Docs
- **`CLAUDE.md`** — updated for: 0.2.0 schema (nested prompt + version
  model), single Spec button, delta protocol flow (mermaid diagram redone),
  load-path migrations, `sweepZombieAgentEvents` rationale.
- **`README.md`** — Layout step copy updated to single ✨ Generate Spec.
- **`skills/bump-layout/SKILL.md`** — see Changed above; full rewrite of
  the Operations + Tools + Important rules sections.
- **`src/content/help/{en,zh-TW}/{ai-cluster,structure-view,notes-rail}.md`**
  — annotation popovers updated to reflect single Spec button, nested
  prompt schema, ``\`tag\``` syntax explanation.

## [0.1.0] — 2026-06-21

### Added
- **Tiptap-backed CommentEditor with inline chip rendering for backtick-delimited
  tags.** Type ``\`flex\``` (or any backtick-wrapped token) in a Frame comment and
  it becomes an atomic purple chip immediately — backspace at the right edge
  deletes the whole chip as one unit. Off-dict words work (``\`登入按鈕\```,
  ``\`text-zinc-100\```, ``\`my-thing\``` — anything with no whitespace inside
  backticks). Card view (frame not selected) shows the same chips from the
  underlying plain-string data, no edit↔card visual jump.
- **Backtick-triggered autocomplete popup** (`@tiptap/suggestion`) — typing
  the opening backtick opens a filtered list of ~250 curated tokens (HTML
  elements, CSS properties, Tailwind/UnoCSS utilities) in `src/lib/labelDict.ts`.
  ↑↓ navigate; Tab / Space commit and insert chip + trailing space. The popup
  is a convenience only — closing the backtick manually still works for
  off-dict input.
- **Tiered autocomplete filter — prefix-match first, then subsequence
  fallback.** Strict-prefix filter alone hides relevant entries when the
  user's typing has a small mismatch — `` `item-cent` `` wouldn't find
  `items-center` because the hyphen breaks the prefix. Subsequence fallback
  (`isSubsequence(query, target)` — every char of query appears in target in
  order, gaps allowed) surfaces near-misses while prefix matches still rank
  first. Same dict cap of 12 results.
- **Custom suggestion decoration class names** — Tiptap defaults
  `decorationClass: 'suggestion'`, which can clash with unrelated CSS in the
  wider page (browser composition underlines, third-party libs). Override to
  `bump-tag-trigger` / `bump-tag-trigger-empty` + explicit `text-decoration:
  none !important` reset in `CommentEditor.vue` to make sure the trigger char
  renders identical to surrounding text (no accidental underline).
- **`CommentEditor.vue` / `TagSuggestionList.vue` / `TagNode` extension /
  suggestion config.** New files: `src/components/CommentEditor.vue`,
  `src/components/TagSuggestionList.vue`, `src/lib/tagNode.ts`,
  `src/lib/tagSuggestion.ts`, `src/lib/labelDict.ts`.
- **One-off migration on workspace load:** `normalizeCommentNewlines` in
  `src/lib/serverState.ts` collapses any `\n{2,}` runs in `sq.comment` /
  `sq.aiNote` to a single `\n`. Fixes already-bloated comments left over
  from the round-trip bug below.
- **`src/shims-vue.d.ts`** — ambient `*.vue` SFC declaration so `.ts` files
  can import Vue components (needed for `tagSuggestion.ts` → `TagSuggestionList`).
- **FEATURES.md #11 [Suggest] button** added to backlog — agent kind
  `suggest-improvements` for reviewing structure (naming consistency, missed
  frames, pattern recognition, tag sanity-check). Schema will reserve a slot
  in the upcoming nested `prompt` shape.

### Changed
- **Default agent model: `sonnet` → `haiku`.** `claude --print` runs are now
  cheaper / faster by default. The bump-layout skill task (read workspace.json,
  apply containment + comment interpretation, write structure/markdown back)
  is well within Haiku's reach. Override in `~/.bump-square/config.json`'s
  `claude.model` if you want sonnet/opus back.
- **Comment syntax for intent tags moved from `#tag` to `` `tag` `` (paired
  backticks).** Matches the markdown / `code` convention the user already uses
  in conversation. Two big wins: paired delimiters mean unambiguous tag
  boundaries (the old `[A-Za-z0-9-]+` regex broke on compound chars), and
  off-dict / non-ASCII content (Chinese, dots, slashes, etc.) is supported
  without a dictionary gate.
- **Agent regex for extracting intent tags from `sq.comment` is now
  `` /`([^`\s]+)`/g `` (was `/#[A-Za-z0-9-]+/`).** The skill
  `skills/bump-layout/SKILL.md` documents this. Non-tag text (e.g. ``\`padding-left\`: 40px`` ) is preserved as-is — chips are a structural
  marker, not a text cutoff.
- **Chip color contrast bumped** so chips read clearly in both editor
  (`bg-zinc-900` background) and card view (`bg-violet-900/25` background).
  Was `bg-violet-500/15 border-violet-500/40 text-violet-200` — washed-out
  in card view because both chip and card were low-opacity violet. Now
  `bg-violet-500/35 border-violet-300/70 text-violet-50` — same hue family,
  much more readable.

### Fixed
- **CommentEditor round-trip bug that exponentially grew empty paragraphs on
  every page refresh.** Tiptap's `editor.getText()` defaults to `\n\n` between
  paragraphs while our `stringToDoc(s).split('\n')` splits on single `\n` —
  each reload added one phantom empty paragraph between every line. Fixed by
  passing `{ blockSeparator: '\n' }` to `getText()` in both the `onUpdate`
  emit and the inbound-prop watch's no-op compare.
- **Single-space chip rendering as a stray-underline-looking artifact.** The
  TagNode InputRule regex was `` /`[^`]+`$/ ``, which accepted ``\` \``` (two
  backticks with only whitespace inside) and produced a chip with a space-only
  label — visually a thin purple bar. Regex tightened to `` /`[^`\s]+`$/ ``;
  parsers in `CommentEditor.vue` (initial doc) and `WorkspaceCanvas.vue`
  (card view) updated symmetrically.

### Removed
- **`useTagPopup` composable + `TagPopup.vue` component.** The pre-Tiptap
  custom `#tag` autocomplete (textarea + manually-positioned popup) is gone.
  Tiptap's `@tiptap/suggestion` + our `TagNode` cover the same UX with
  native IME, caret, undo, paste, and multi-line behavior for free.
- **`autoGrow` directive on textarea.** Tiptap content-grows-with-text
  naturally; no manual `scrollHeight` measurement needed.

### Dependencies
Added:
- `@tiptap/core@3.27.1`
- `@tiptap/vue-3@3.27.1`
- `@tiptap/extension-document@3.27.1`
- `@tiptap/extension-paragraph@3.27.1`
- `@tiptap/extension-text@3.27.1`
- `@tiptap/extension-history@3.27.1`
- `@tiptap/extension-placeholder@3.27.1`
- `@tiptap/suggestion@3.27.1`

All MIT-licensed. Tiptap Cloud (paid) is not used; only the open-source core +
extensions.

### Docs
- **CLAUDE.md** — added CommentEditor / TagNode / TagSuggestion / labelDict
  entries to the file inventory; added Tiptap to the tech stack; updated
  `serverState` entry to mention `normalizeCommentNewlines` migration;
  updated comment description in the functionality section with backtick
  syntax notes.
- **skills/bump-layout/SKILL.md** — added "Reading `comment`" section
  documenting the backtick token convention + extraction regex; explicit
  note that non-tag text is meaningful and must not be discarded.
- **README.md** — Layout step example updated with backtick syntax;
  Config section's example reflects `model: 'haiku'` default.

## [0.0.1] — initial alpha

Repository, dev server, frame drawing on uploaded screenshots, `claude --print`
agent integration via `/bump-layout` skill, containment-based structure tree,
markdown spec handoff, named saves, terminal panel, i18n (en + zh-TW),
inline `#tag` autocomplete (precursor to 0.1.0's backtick rewrite).
