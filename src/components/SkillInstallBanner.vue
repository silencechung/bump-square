<script setup lang="ts">
import { ref } from 'vue';
import { useWorkspaceStore } from '../stores/workspace';

const store = useWorkspaceStore();
const installing = ref(false);

async function install() {
  installing.value = true;
  try {
    await store.installSkillAndRetry();
  } finally {
    installing.value = false;
  }
}
</script>

<template>
  <div
    v-if="store.skillMissing"
    class="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-lg bg-amber-500/95 text-amber-950 shadow-lg backdrop-blur"
  >
    <span class="text-sm">
      ⚠️ <strong>bump-layout</strong> skill 尚未安裝 — Claude 無法產生意圖結構
    </span>
    <button
      class="text-xs px-3 py-1 rounded bg-amber-900 text-amber-50 hover:bg-amber-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      :disabled="installing"
      @click="install"
    >{{ installing ? '安裝中…' : '一鍵安裝並重試' }}</button>
    <button
      class="text-xs text-amber-900 hover:text-amber-700 px-1 transition-colors"
      title="關閉"
      @click="store.dismissSkillMissing()"
    >✕</button>
  </div>
</template>
