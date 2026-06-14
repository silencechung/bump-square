<script setup lang="ts">
import { ref } from 'vue';
import { useWorkspaceStore } from '~src/stores/workspace';
import { useT } from '~src/composables/useT';

const t = useT();
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
    <span class="text-sm flex items-center gap-1.5">
      <span class="i-lucide-triangle-alert" />
      <span><strong>bump-layout</strong>{{ t('installBanner.msg') }}</span>
    </span>
    <button
      class="text-xs px-3 py-1 rounded bg-amber-900 text-amber-50 hover:bg-amber-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      :disabled="installing"
      @click="install"
    >{{ installing ? t('installBanner.installing') : t('installBanner.install') }}</button>
    <button
      class="text-xs text-amber-900 hover:text-amber-700 px-1 transition-colors"
      :title="t('installBanner.close')"
      @click="store.dismissSkillMissing()"
    >
      <span class="i-lucide-x" />
    </button>
  </div>
</template>
