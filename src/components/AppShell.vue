<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import { useWorkspaceStore } from '../stores/workspace';
import UploadPanel from './UploadPanel.vue';
import WorkspaceCanvas from './WorkspaceCanvas.vue';
import AgentPanel from './AgentPanel.vue';
import StructureView from './StructureView.vue';
import SavesMenu from './SavesMenu.vue';

const store = useWorkspaceStore();

onMounted(() => store.connect());

const steps = ['upload', 'layout', 'structure'] as const;
const stepLabels: Record<string, string> = {
  upload: 'Upload',
  layout: 'Layout',
  structure: 'Structure',
};
// Each step's purpose, surfaced as a tooltip so the nav isn't ambiguous.
const stepTitles: Record<string, string> = {
  upload: '① 上傳設計截圖',
  layout: '② 畫框並標註每塊的意圖（comment）→ 產生意圖結構',
  structure: '③ 檢視產生的意圖結構，送交開發 agent',
};

const hasStructure = computed(() => !!store.structure.tree);

// Right-side agent panel is collapsible to give the canvas more room.
const agentOpen = ref(true);

function canVisit(s: string): boolean {
  if (s === 'upload') return true;
  if (s === 'structure') return hasStructure.value;
  return !!store.sourceImage;
}
</script>

<template>
  <div class="h-screen flex flex-col bg-zinc-900 text-zinc-100">
    <header class="h-11 shrink-0 border-b border-zinc-800 flex items-center px-4 gap-4">
      <span class="text-sm font-bold text-white">bump-square</span>
      <!-- Breadcrumb steps as chevron tabs: the triangular edge shows direction. -->
      <div class="flex items-center gap-0.5">
        <button
          v-for="s in steps"
          :key="s"
          class="text-sm pl-7 pr-8 py-1.5 font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed [clip-path:polygon(0_0,calc(100%_-_10px)_0,100%_50%,calc(100%_-_10px)_100%,0_100%,10px_50%)]"
          :class="store.step === s ? 'bg-violet-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'"
          :disabled="!canVisit(s)"
          :title="stepTitles[s]"
          @click="store.step = s as typeof store.step"
        >{{ stepLabels[s] }}</button>
      </div>
      <div class="ml-auto flex items-center gap-3">
        <span
          v-if="hasStructure && store.step !== 'structure'"
          class="text-xs text-emerald-400 cursor-pointer hover:underline"
          @click="store.step = 'structure'"
        >✓ structure ready →</span>
        <SavesMenu />
        <button class="text-xs text-zinc-500 hover:text-red-400" @click="store.reset()">reset</button>
      </div>
    </header>

    <UploadPanel v-if="store.step === 'upload'" />

    <div
      v-else-if="store.step === 'layout'"
      class="flex-1 flex overflow-hidden"
    >
      <WorkspaceCanvas />
      <AgentPanel v-if="agentOpen" @collapse="agentOpen = false" />
      <button
        v-else
        class="w-8 shrink-0 border-l border-zinc-700/60 bg-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/60 transition-colors flex flex-col items-center justify-center gap-2"
        title="Show agent panel"
        @click="agentOpen = true"
      >
        <span class="text-sm">‹</span>
        <span class="text-xs uppercase tracking-wider [writing-mode:vertical-rl]">🤖 Agent</span>
      </button>
    </div>

    <div v-else-if="store.step === 'structure'" class="flex-1 flex overflow-hidden">
      <StructureView />
      <AgentPanel v-if="agentOpen" @collapse="agentOpen = false" />
      <button
        v-else
        class="w-8 shrink-0 border-l border-zinc-700/60 bg-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/60 transition-colors flex flex-col items-center justify-center gap-2"
        title="Show agent panel"
        @click="agentOpen = true"
      >
        <span class="text-sm">‹</span>
        <span class="text-xs uppercase tracking-wider [writing-mode:vertical-rl]">🤖 Agent</span>
      </button>
    </div>
  </div>
</template>
