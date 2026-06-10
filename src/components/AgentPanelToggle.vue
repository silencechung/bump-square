<script setup lang="ts">
// Collapsed-state strip for the agent panel: a thin vertical bar shown in place
// of <AgentPanel> when it's hidden. Clicking re-expands. Extracted because the
// Layout and Structure steps in AppShell rendered this identical markup twice.
defineEmits<{ expand: [] }>();
</script>

<template>
  <button
    class="w-8 shrink-0 border-l border-zinc-700/60 bg-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/60 transition-colors flex flex-col items-center justify-center gap-2"
    title="Show agent panel"
    @click="$emit('expand')"
  >
    <span class="i-lucide-chevron-left text-lg" />
    <span class="i-lucide-bot text-violet-400" />
    <span class="text-xs uppercase tracking-wider [writing-mode:vertical-rl]">Agent</span>
  </button>
</template>
