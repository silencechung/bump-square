<script setup lang="ts">
import { ref, watch } from 'vue';

/**
 * Suggestion popup body for backtick-tag autocomplete inside CommentEditor.
 *
 * Rendered by `tagSuggestion.ts` via Tiptap's `VueRenderer`, mounted into a
 * free-floating div positioned against the caret's `clientRect`. Keyboard is
 * forwarded here from the suggestion plugin through `defineExpose`d
 * `onKeyDown` — return true to swallow the key, false to let it pass through.
 *
 * Commit semantics (paired with backtick close):
 * - Tab   → commit, swallow (no focus change)
 * - Space → commit, swallow (the suggestion's `command` inserts the tag node
 *           AND a trailing space, so we don't want the browser's default
 *           space-insert too — would produce a double space)
 * - Enter → don't intercept; Tiptap's paragraph rule fires and the suggestion
 *           exits naturally. We don't steal Enter because the comment is
 *           multi-line.
 * - Esc   → don't intercept; suggestion plugin handles dismissal
 */
const props = defineProps<{
  items: string[];
  command: (item: { id: string; label: string }) => void;
}>();

const selectedIndex = ref(0);

watch(() => props.items, () => {
  selectedIndex.value = 0;
});

function selectItem(i: number) {
  const item = props.items[i];
  if (!item) {
    return;
  }
  props.command({ id: item, label: item });
}

defineExpose({
  onKeyDown(event: KeyboardEvent): boolean {
    if (event.isComposing) {
      // CJK IME composition in flight: don't intercept. Composition strings
      // are non-ASCII, so the suggestion's allowed-char filter would exit
      // the popup on its own once a CJK char lands.
      return false;
    }
    if (event.key === 'ArrowDown') {
      selectedIndex.value = (selectedIndex.value + 1) % props.items.length;
      return true;
    }
    if (event.key === 'ArrowUp') {
      selectedIndex.value =
        (selectedIndex.value - 1 + props.items.length) % props.items.length;
      return true;
    }
    if (event.key === 'Tab' || event.key === ' ') {
      selectItem(selectedIndex.value);
      return true;
    }
    return false;
  },
});
</script>

<template>
  <div class="bg-zinc-900 border border-violet-700/60 rounded-md shadow-xl overflow-hidden min-w-32 max-w-60 text-sm pointer-events-auto">
    <ul class="max-h-60 overflow-y-auto no-scrollbar">
      <li
        v-for="(item, i) in items"
        :key="item"
        :class="[
          'px-3 py-1 cursor-pointer text-zinc-100 font-mono',
          i === selectedIndex ? 'bg-violet-700/60' : 'hover:bg-zinc-700/60',
        ]"
        @mousedown.prevent="selectItem(i)"
      >
        <span class="text-violet-400">`</span>{{ item }}<span class="text-violet-400">`</span>
      </li>
    </ul>
  </div>
</template>
