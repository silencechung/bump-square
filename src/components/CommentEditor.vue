<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import History from '@tiptap/extension-history';
import Placeholder from '@tiptap/extension-placeholder';
import { watch } from 'vue';
import { TagNode } from '~src/lib/tagNode';
import { TagSuggestion } from '~src/lib/tagSuggestion';

/**
 * Tiptap-backed comment editor with inline chip rendering for backtick-
 * delimited tokens.
 *
 * Syntax: ``\`text\``` → atomic chip with `text` as label. Tiptap's InputRule
 * fires on the closing backtick keystroke (see `src/lib/tagNode.ts`); a chip
 * pasted in via load (workspace.json reload, save load, agent rewrite) goes
 * through `parseLine` below and is emitted as a tag node directly.
 *
 * Why not textarea + overlay: see `~/.bump-square/...` discussion thread; in
 * short, textarea can't render inline styled atoms, and overlay-on-textarea
 * needs perfect font-metric sync. Tiptap (built on ProseMirror) gives us
 * native IME, caret, undo, paste, multi-line behavior for free.
 *
 * Data contract: editor accepts and emits PLAIN STRING with backtick syntax,
 * so workspace.json stays human-readable and `claude --print` can grep
 * `/\`([^\`]+)\`/g` to pull intent tags.
 */
const props = defineProps<{
  modelValue: string;
  placeholder?: string;
  autofocus?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  blur: [];
}>();

function stringToDoc(s: string) {
  const lines = s.split('\n');
  return {
    type: 'doc',
    content: lines.map((line) => {
      const content = parseLine(line);
      return content.length > 0
        ? { type: 'paragraph', content }
        : { type: 'paragraph' };
    }),
  };
}

function parseLine(line: string) {
  const out: Array<Record<string, unknown>> = [];
  // Mirrors the InputRule in tagNode.ts: no whitespace inside the tag so
  // ``\` \``` round-trips as plain text rather than getting parsed as a
  // single-space chip on reload.
  const re = /`([^`\s]+)`/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > lastIndex) {
      out.push({ type: 'text', text: line.slice(lastIndex, m.index) });
    }
    out.push({
      type: 'tag',
      attrs: { label: m[1] },
    });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < line.length) {
    out.push({ type: 'text', text: line.slice(lastIndex) });
  }
  return out;
}

const editor = useEditor({
  content: stringToDoc(props.modelValue),
  autofocus: props.autofocus ?? false,
  extensions: [
    Document,
    Paragraph,
    Text,
    History,
    Placeholder.configure({ placeholder: props.placeholder ?? '' }),
    TagNode,
    TagSuggestion,
  ],
  editorProps: {
    attributes: {
      class:
        'block w-full box-border text-sm bg-zinc-900 border border-violet-500/60 rounded-lg px-2.5 py-1.5 text-zinc-100 focus:outline-none focus:border-violet-500 leading-snug break-words min-h-7.5 max-h-50 overflow-y-auto overflow-x-hidden no-scrollbar',
    },
  },
  onUpdate: ({ editor: ed }) => {
    // `blockSeparator: '\n'` is load-bearing: must match the `\n` split in
    // `stringToDoc.split('\n')`. Tiptap defaults to `\n\n` between paragraphs,
    // which would inject a phantom empty paragraph on every round-trip and
    // grow the comment exponentially on every refresh.
    emit('update:modelValue', ed.getText({ blockSeparator: '\n' }));
  },
  onBlur: () => {
    emit('blur');
  },
});

watch(
  () => props.modelValue,
  (val) => {
    const ed = editor.value;
    if (!ed) {
      return;
    }
    if (val === ed.getText({ blockSeparator: '\n' })) {
      return;
    }
    ed.commands.setContent(stringToDoc(val), { emitUpdate: false });
  },
);
</script>

<template>
  <EditorContent :editor="editor" />
</template>

<style>
.ProseMirror p.is-editor-empty:first-child::before {
  color: rgb(82 82 91);
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}
.ProseMirror p {
  margin: 0;
}
/* Suggestion plugin wraps the trigger char + query in this span while active.
   No visual decoration — the popup is the affordance; the trigger char itself
   should look identical to surrounding text so the user's typing flow isn't
   disrupted. Hard-resetting common "accidental underline" sources. */
.ProseMirror .bump-tag-trigger,
.ProseMirror .bump-tag-trigger-empty {
  text-decoration: none !important;
  border-bottom: none !important;
  background: transparent !important;
}
</style>
