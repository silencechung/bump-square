# Changelog

All notable changes to bump-square. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this project is **pre-1.0 personal-tool alpha** so SemVer is loose — features
land when they're useful, breaking changes happen when the design shifts.

Dates are local (Asia/Taipei).

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
