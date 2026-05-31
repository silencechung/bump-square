<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useWorkspaceStore } from '../stores/workspace';

const store = useWorkspaceStore();
const listRef = ref<HTMLDivElement | null>(null);

// Collapse is owned by the parent (AppShell) so the layout can reclaim the width.
defineEmits<{ collapse: [] }>();

watch(() => store.agentNotes.length, async () => {
  await nextTick();
  listRef.value?.scrollTo({ top: listRef.value.scrollHeight, behavior: 'smooth' });
});

function fmt(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
</script>

<template>
  <aside class="w-72 shrink-0 bg-zinc-800 border-l border-zinc-700/60 flex flex-col overflow-hidden">
    <div class="p-3 border-b border-zinc-700/60 flex items-center gap-2">
      <button
        class="w-8 h-8 icon-btn hover:text-zinc-100 text-xl leading-none"
        title="Collapse agent panel"
        @click="$emit('collapse')"
      >›</button>
      <h2 class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">🤖 Agent</h2>
      <button
        v-if="store.agentNotes.length"
        class="ml-auto w-8 h-8 icon-btn hover:text-red-400"
        title="Clear all agent messages"
        @click="store.clearAgentNotes()"
      >🗑</button>
      <span
        class="flex items-center gap-1.5 text-xs"
        :class="[store.connected ? 'text-cyan-400' : 'text-zinc-600', store.agentNotes.length ? '' : 'ml-auto']"
      >
        <span class="w-1.5 h-1.5 rounded-full" :class="store.connected ? 'bg-cyan-400' : 'bg-zinc-600'" />
        {{ store.connected ? 'live' : 'offline' }}
      </span>
    </div>

    <div ref="listRef" class="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar p-3 space-y-2">
      <div v-if="store.agentNotes.length === 0" class="text-zinc-600 text-xs leading-relaxed pt-4">
        <p class="mb-3">This panel shows what Claude does to your board.</p>
        <p class="mb-1 text-zinc-500 font-semibold">Talk to the agent in your terminal:</p>
        <ul class="space-y-1 list-disc list-inside text-zinc-600">
          <li>"segment the design"</li>
          <li>"merge the logo and title into one asset"</li>
          <li>"suggest frames for this layout"</li>
          <li>"generate the structure"</li>
        </ul>
      </div>

      <div
        v-for="note in store.agentNotes"
        :key="note.id"
        class="bg-cyan-900/30 border border-cyan-700/40 rounded-xl px-3 py-2 text-sm text-zinc-100 leading-relaxed"
      >
        <div class="text-xs text-cyan-400/90 mb-0.5">{{ fmt(note.timestamp) }}</div>
        {{ note.text }}
      </div>
    </div>

    <div class="p-3 border-t border-zinc-700/60 text-xs text-zinc-500 leading-relaxed">
      💬 The conversation happens in your terminal. This board syncs live via MCP.
    </div>
  </aside>
</template>
