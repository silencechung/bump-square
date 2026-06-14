<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue';
import { useWorkspaceStore } from '../stores/workspace';

const store = useWorkspaceStore();
const listRef = ref<HTMLDivElement | null>(null);

// Collapse is owned by the parent (AppShell) so the layout can reclaim the width.
defineEmits<{ collapse: [] }>();

// Newest entries render at the top, so auto-scroll is a no-op for new arrivals
// — but a previously-running entry transitioning to completed should NOT
// scroll the list (the user might be reading older entries). Only scroll-to-
// top when a brand-new row appears.
watch(() => store.agentEvents.length, async () => {
  await nextTick();
  listRef.value?.scrollTo({ top: 0, behavior: 'smooth' });
});

const KIND_ICONS: Record<string, string> = {
  'generate-structure': 'i-lucide-puzzle',
  'suggest-assets': 'i-lucide-sparkles',
};

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDuration(startedAt: number, completedAt: number | null): string | null {
  if (completedAt === null) return null;
  const ms = completedAt - startedAt;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// Newest first — UI mirrors xterm's append-at-bottom by putting fresh action
// at the top of a side panel. (TerminalPanel is read live; this is history.)
const events = computed(() => [...store.agentEvents].slice().reverse());
</script>

<template>
  <aside class="w-72 shrink-0 bg-zinc-800 border-l border-zinc-700/60 flex flex-col overflow-hidden">
    <div class="p-3 border-b border-zinc-700/60 flex items-center gap-2">
      <button
        class="w-8 h-8 icon-btn hover:text-zinc-100"
        title="Collapse agent panel"
        @click="$emit('collapse')"
      >
        <span class="i-lucide-chevron-right text-lg" />
      </button>
      <h2 class="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
        <span class="i-lucide-bot text-violet-400" />
        <span>Agent events</span>
      </h2>
      <button
        v-if="events.length"
        class="ml-auto w-8 h-8 icon-btn hover:text-red-400"
        title="清空 agent 事件紀錄"
        @click="store.clearAgentEvents()"
      >
        <span class="i-lucide-trash-2" />
      </button>
      <span
        class="flex items-center gap-1.5 text-xs"
        :class="[store.connected ? 'text-cyan-400' : 'text-zinc-600', events.length ? '' : 'ml-auto']"
      >
        <span class="w-1.5 h-1.5 rounded-full" :class="store.connected ? 'bg-cyan-400' : 'bg-zinc-600'" />
        {{ store.connected ? 'live' : 'offline' }}
      </span>
    </div>

    <div ref="listRef" class="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar p-3 space-y-2">
      <div v-if="events.length === 0" class="text-zinc-500 text-xs leading-relaxed pt-4">
        <p class="mb-3">每次按 header 上的 AI 按鈕(🧩 產生結構 / ✨ assets prompt),這裡會記一筆。</p>
        <p>跑中的 entry 顯示 spinner;完成後顯示 <span class="i-lucide-check text-emerald-400 align-middle" /> / <span class="i-lucide-x text-red-400 align-middle" /> + 摘要那一行。即時輸出在底下 terminal panel。</p>
      </div>

      <div
        v-for="ev in events"
        :key="ev.id"
        class="rounded-xl px-3 py-2 border"
        :class="ev.completedAt === null
          ? 'bg-cyan-900/30 border-cyan-700/50'
          : ev.exitCode === 0
            ? 'bg-emerald-900/20 border-emerald-700/40'
            : 'bg-red-900/20 border-red-700/40'"
      >
        <div class="flex items-center gap-1.5 text-xs">
          <span :class="KIND_ICONS[ev.kind] ?? 'i-lucide-circle'" class="text-zinc-300" />
          <span class="text-zinc-100 font-mono">{{ ev.kind }}</span>
          <span class="ml-auto flex items-center gap-1.5">
            <span v-if="ev.completedAt === null" class="i-lucide-loader-2 animate-spin text-cyan-400" />
            <span v-else-if="ev.exitCode === 0" class="i-lucide-check text-emerald-400" />
            <span v-else class="i-lucide-x text-red-400" />
            <span class="text-zinc-500 tabular-nums">{{ fmtTime(ev.startedAt) }}</span>
            <span v-if="fmtDuration(ev.startedAt, ev.completedAt)" class="text-zinc-600">· {{ fmtDuration(ev.startedAt, ev.completedAt) }}</span>
          </span>
        </div>
        <p v-if="ev.summary" class="mt-1.5 text-xs text-zinc-300 leading-snug">
          {{ ev.summary }}
        </p>
      </div>
    </div>

    <div class="p-3 border-t border-zinc-700/60 text-xs text-zinc-500 leading-relaxed flex items-center gap-1.5">
      <span class="i-lucide-terminal text-zinc-400" />
      <span>即時輸出在底下 terminal panel。</span>
    </div>
  </aside>
</template>
