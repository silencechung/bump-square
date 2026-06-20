import { Node, mergeAttributes, nodeInputRule } from '@tiptap/core';

/**
 * Inline atomic "tag" chip — backtick-delimited text in the user's comment.
 *
 * Trigger: user types ``\`text\``` literally in the editor. The closing
 * backtick fires the InputRule below, which replaces the full ``\`text\```
 * range (delimiters included) with a single Tag node whose `label` is the
 * inner text. The node is `atom: true` so caret arrow-keys + backspace treat
 * it as one unit (matches the "chip becomes a box immediately" UX).
 *
 * Round-trip contract:
 *  - Plain-string → doc:  `parseLine` in CommentEditor.vue spots ``\`text\```
 *    patterns when initializing the editor and emits `{ type: 'tag', attrs }`
 *    nodes directly (no InputRule replay needed for content loaded from
 *    workspace.json).
 *  - Doc → plain-string:  `renderText` below puts the backticks back so
 *    `editor.getText()` produces the same syntax we accept on input. The
 *    downstream `claude --print` agent matches `/\`([^\`]+)\`/g` to extract
 *    intent tags — schema change vs. the old `#tag` form is exactly this
 *    regex swap, nothing else.
 *
 * Off-dict is the whole point of moving to backticks: anything the regex
 * `[^\`]+` accepts (incl. Chinese, dashes, slashes, dots) becomes a chip, so
 * there's no autocomplete dict gating the user's intent vocabulary.
 */
export const TagNode = Node.create({
  name: 'tag',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      label: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-label') ?? '',
        renderHTML: (attrs: { label: string }) => ({ 'data-label': attrs.label }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="tag"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(
        {
          'data-type': 'tag',
          // Chip styling — must match the card-view chip in WorkspaceCanvas.vue
          // so edit ↔ card has no visual jump.
          // Chip styling — must match the card-view chip in WorkspaceCanvas.vue.
          // Bumped from `/15` + `/40` + `violet-200` (too washed against the
          // card's violet-900/25 bg) to stronger fill / brighter border /
          // near-white text so chips are clearly readable in both editor
          // (zinc-900 bg) and card (violet-900/25 bg) contexts.
          class:
            'inline-block bg-violet-500/35 border border-violet-300/70 text-violet-50 rounded-md px-1.5 py-0 font-mono text-xs align-baseline',
        },
        HTMLAttributes,
      ),
      node.attrs.label,
    ];
  },

  renderText({ node }) {
    return `\`${node.attrs.label}\``;
  },

  addInputRules() {
    return [
      // No capture group on purpose — `nodeInputRule`'s capture-group branch
      // tries to preserve the trigger char (emoji-shortcode pattern) and only
      // replaces the inner text; we want the WHOLE ``\`text\``` consumed and
      // swapped for a Tag node, which is exactly what the no-capture-group
      // branch (`tr.replaceWith(start, end, newNode)`) does. Label is parsed
      // out of `match[0]` in `getAttributes`.
      nodeInputRule({
        // `[^\`\s]+` forbids whitespace inside the tag: ``\` \``` would
        // otherwise match with `label = ' '` and render as an invisible
        // chip the size of a single space — looks like a stray underline
        // to the user. Disallowing space also keeps tags single-token,
        // matching the dict semantics (no entries contain spaces).
        find: /`[^`\s]+`$/,
        type: this.type,
        getAttributes: (match) => ({ label: match[0].slice(1, -1) }),
      }),
    ];
  },
});
