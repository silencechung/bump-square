# Notes rail

One row per frame on the right:

- **`comment`** — your intent (free text)
- **`aiNote`** — the agent's inferred read, read-only

Together they form a "**double confirmation**": the agent reads your `comment`, you read how the agent understood it — if they diverge, correct each other.

✏ rename, ⧉ duplicate, ✕ delete. Floating labels can be toggled on / off.

## `` ` `` token-marker syntax

The comment editor is Tiptap-backed — **anything wrapped in paired backticks renders as a purple chip** (atomic — backspace at the right edge deletes the whole chip):

- `` `flex` `` `` `padding-left` `` `` `text-zinc-100` `` — mark a CSS / Tailwind / HTML token
- `` `登入按鈕` `` — Chinese / any chars are fine (the only restriction is no whitespace inside the backticks)
- Typing an opening backtick pops an autocomplete list (~250 HTML / CSS / Tailwind tokens, prefix-first with subsequence fallback). ↑↓ navigate, Tab / Space to commit
- Off-dict is also fine — just type your closing backtick yourself and it becomes a chip anyway

**The underlying data stays plain text** — `` `flex` `` is literally `` `flex` `` in `workspace.json`. The agent extracts intent tokens with `` /`([^`\s]+)`/g `` regex. Chips are visual convenience only; **values and modifiers around chips are preserved verbatim** (`` `padding-left`: 40px `` reaches the downstream agent in full).
