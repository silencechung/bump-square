import { Extension } from '@tiptap/core';
import { Suggestion } from '@tiptap/suggestion';
import type { SuggestionKeyDownProps } from '@tiptap/suggestion';
import { VueRenderer } from '@tiptap/vue-3';
import TagSuggestionList from '~src/components/TagSuggestionList.vue';
import { LABEL_DICT } from '~src/lib/labelDict';

/** What the popup hands back to `command` when the user picks an entry. */
type TagSelection = { id: string; label: string };

/**
 * Subsequence match: every char of `q` appears in `target` in order (gaps
 * allowed). Used as a fallback when strict-prefix matching produces no hits,
 * so typos / singular-plural slips still surface a relevant suggestion.
 * Both args expected lowercase by the caller.
 */
function isSubsequence(q: string, target: string): boolean {
  if (q.length === 0) {
    return true;
  }
  let qi = 0;
  for (let ti = 0; ti < target.length && qi < q.length; ti++) {
    if (target[ti] === q[qi]) {
      qi++;
    }
  }
  return qi === q.length;
}

/**
 * Backtick-triggered autocomplete extension for the bump-square comment
 * editor. Sits on top of the `TagNode` + InputRule pair (see `tagNode.ts`):
 *
 * Two parallel paths produce the same end state (a Tag node):
 *  1. Pop-up commit — user types ``\` `` then chars; popup filters
 *     `LABEL_DICT` by prefix; user picks via ↑↓ + Tab/Space → suggestion's
 *     `command` runs `insertContentAt(range, tagNode + space)`. The opening
 *     backtick + query is replaced by the chip; no closing backtick needed.
 *  2. Manual close — user types ``\`text\``` end-to-end; the popup may or
 *     may not have opened on the ``\` ``, but the closing backtick exits the
 *     suggestion (non-allowed char) and the `TagNode` InputRule then fires
 *     on the full ``\`text\``` and replaces it with the chip.
 *
 * Off-dict words go through path 2 (manual close) since they have no popup
 * match to commit on.
 *
 * `allowedPrefixes: null` lets the trigger fire anywhere — beginning of
 * paragraph, mid-word, after punctuation — so users can drop tags into
 * prose without thinking about leading whitespace.
 */
export const TagSuggestion = Extension.create({
  name: 'tagSuggestion',

  addProseMirrorPlugins() {
    return [
      Suggestion<string, TagSelection>({
        editor: this.editor,
        char: '`',
        allowedPrefixes: null,
        // Avoid the default `.suggestion` class — anything in the page
        // (browser default for `<span>` siblings, third-party CSS, IME
        // composition decoration) that happens to target it gets out of the
        // way. We use a uniquely-named class and explicitly reset it in the
        // component's <style>.
        decorationTag: 'span',
        decorationClass: 'bump-tag-trigger',
        decorationEmptyClass: 'bump-tag-trigger-empty',

        items: ({ query }) => {
          if (!query) {
            return LABEL_DICT.slice().sort().slice(0, 12);
          }
          const lower = query.toLowerCase();
          // Tiered match: prefix wins (highest signal), then subsequence
          // catches near-misses like singular/plural mismatch (`item-cent`
          // → `items-center`) or typos. Without the fallback the popup
          // appears to vanish on hyphenated near-matches.
          const prefix: string[] = [];
          const subseq: string[] = [];
          for (const k of LABEL_DICT) {
            const kl = k.toLowerCase();
            if (kl.startsWith(lower)) {
              prefix.push(k);
            } else if (isSubsequence(lower, kl)) {
              subseq.push(k);
            }
          }
          prefix.sort();
          subseq.sort();
          return [...prefix, ...subseq].slice(0, 12);
        },

        command: ({ editor, range, props }) => {
          // `range` covers the opening backtick + everything typed after it.
          // Replace that whole span with a Tag node + a trailing space, so
          // the user's typing flow continues naturally on the same line.
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: 'tag', attrs: { label: props.id } },
              { type: 'text', text: ' ' },
            ])
            .run();
        },

        render: () => {
          let component: VueRenderer | null = null;
          let popupEl: HTMLDivElement | null = null;

          function position(rect: DOMRect | null) {
            if (!popupEl || !rect) {
              return;
            }
            // Default below caret; flip above if it would overflow viewport
            // bottom. Measure AFTER append so `offsetHeight` is real. Same
            // pattern as `AnnotationOverlay`'s placement logic.
            popupEl.style.left = `${rect.left}px`;
            popupEl.style.top = '0px'; // temp so we can measure clean height
            const popupHeight = popupEl.offsetHeight;
            const gap = 4;
            const wouldOverflowBottom = rect.bottom + gap + popupHeight > window.innerHeight;
            const top = wouldOverflowBottom
              ? Math.max(gap, rect.top - gap - popupHeight)
              : rect.bottom + gap;
            popupEl.style.top = `${top}px`;
          }

          return {
            onStart: (suggestionProps) => {
              component = new VueRenderer(TagSuggestionList, {
                props: suggestionProps,
                editor: suggestionProps.editor,
              });
              if (!suggestionProps.clientRect || !component.element) {
                return;
              }
              popupEl = document.createElement('div');
              popupEl.style.position = 'fixed';
              popupEl.style.zIndex = '50';
              popupEl.appendChild(component.element);
              document.body.appendChild(popupEl);
              position(suggestionProps.clientRect());
            },

            onUpdate: (suggestionProps) => {
              component?.updateProps(suggestionProps);
              if (suggestionProps.clientRect) {
                position(suggestionProps.clientRect());
              }
            },

            onKeyDown: (suggestionKeyDownProps: SuggestionKeyDownProps) => {
              if (suggestionKeyDownProps.event.key === 'Escape') {
                return false;
              }
              const exposed = component?.ref as
                | { onKeyDown?: (e: KeyboardEvent) => boolean }
                | null;
              return exposed?.onKeyDown?.(suggestionKeyDownProps.event) ?? false;
            },

            onExit: () => {
              popupEl?.remove();
              popupEl = null;
              component?.destroy();
              component = null;
            },
          };
        },
      }),
    ];
  },
});
