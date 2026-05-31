<script setup lang="ts">
/**
 * Recursive visual tree of the intent structure. Renders a StructureNode and
 * its children as a nested, indented hierarchy with connector lines. Parent
 * nodes can be collapsed/expanded. Clicking a node that maps to a frame jumps
 * back to the Layout step and selects it (keeps the confirm loop reversible).
 *
 * The component references itself by name in its own template (Vue resolves a
 * SFC's own filename), which is what makes the recursion work.
 */
import type { StructureNode } from '../types';
import { useWorkspaceStore } from '../stores/workspace';
import { ref, computed } from 'vue';

const props = defineProps<{ node: StructureNode; root?: boolean }>();
const store = useWorkspaceStore();

const collapsed = ref(false);
const hasChildren = computed(() => !!(props.node.children && props.node.children.length));

function focusFrame() {
  if (!props.node.squareId) return;
  store.selectedSquareId = props.node.squareId;
  store.step = 'layout';
}
</script>

<template>
  <div class="tree-node" :class="{ 'is-child': !root }">
    <div
      class="node-row group flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors"
      :class="[node.squareId ? 'hover:bg-zinc-800' : '', hasChildren ? 'has-toggle' : '']"
    >
      <!-- Disclosure toggle (parents) as a circular +/- button, or a leaf dot —
           fixed-width slot so labels line up. -->
      <span
        class="relative z-[1] shrink-0 w-8 flex justify-center"
        :class="hasChildren ? 'self-end' : ''"
      >
        <button
          v-if="hasChildren"
          type="button"
          class="w-7 h-7 flex items-center justify-center rounded-full border border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-violet-500 hover:border-violet-500 hover:text-white text-base font-medium leading-none transition-colors"
          :title="collapsed ? '展開' : '收合'"
          @click.stop="collapsed = !collapsed"
        >{{ collapsed ? '+' : '−' }}</button>
        <span v-else class="mt-2.5 w-2 h-2 rounded-full bg-violet-400"></span>
      </span>

      <button
        type="button"
        class="flex flex-col min-w-0 gap-1 flex-1 text-left"
        :class="node.squareId ? 'cursor-pointer' : 'cursor-default'"
        :title="node.squareId ? 'Jump to this frame in Layout' : undefined"
        @click="focusFrame"
      >
        <span class="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap">
          <span class="text-base font-medium text-zinc-100">{{ node.label }}</span>
          <span class="text-sm text-zinc-500 leading-snug break-words">{{ node.type }}</span>
          <span v-if="collapsed && hasChildren" class="text-sm text-zinc-600">({{ node.children!.length }})</span>
        </span>
        <span
          v-if="node.comment"
          class="text-sm text-zinc-400 leading-relaxed break-words"
        >💬 {{ node.comment }}</span>
      </button>

      <span
        v-if="node.squareId"
        class="ml-auto self-center text-xs text-violet-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
      >→ frame</span>
    </div>

    <div v-if="hasChildren && !collapsed" class="children">
      <StructureTree v-for="child in node.children" :key="child.id" :node="child" />
    </div>
  </div>
</template>

<style scoped>
/* Indent children and draw a clear vertical guide line; each child gets a short
   horizontal connector tick back to that line. */
/* The vertical guide line sits at 1.5rem — the exact center of a row's toggle
   slot (px-2 0.5rem + half of the w-8 slot 1rem), so it runs straight down
   through the parent's +/- button. Children are indented past it by padding. */
.children {
  margin-left: 1.5rem;
  padding-left: 0.75rem;
  border-left: 1.5px solid rgb(113 113 122 / 0.7); /* zinc-500/70 — clearly visible */
}
.tree-node.is-child {
  position: relative;
  margin-top: 0.25rem;
}
/* Horizontal connector: from the guide line across to the child's toggle/dot
   center (1.5rem in child coords). top 1.25rem = the toggle/dot vertical center
   (py-1.5 0.375rem + half of h-7 0.875rem). The toggle paints over it via z-[1]. */
.tree-node.is-child > .node-row::before {
  content: '';
  position: absolute;
  left: -0.75rem;
  top: 1.25rem;
  width: 2.25rem;
  height: 1.5px;
  background: rgb(113 113 122 / 0.7); /* zinc-500/70 */
}
/* Rows that have children align their +/- toggle to the BOTTOM (so it hugs the
   guide line into its own children), so the incoming connector must anchor to
   the bottom too — 1.25rem up = toggle center (py-1.5 0.375 + half h-7 0.875). */
.tree-node.is-child > .node-row.has-toggle::before {
  top: auto;
  bottom: 1.25rem;
}
</style>
