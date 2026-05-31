<script setup lang="ts">
/**
 * Named saves dropdown (header). Save the current board under a name, and
 * re-open / delete earlier saves. The list is fetched from the server; loading
 * replaces the live board (its new state arrives via SSE).
 */
import { ref } from 'vue';
import { onClickOutside } from '@vueuse/core';
import { useWorkspaceStore } from '../stores/workspace';

const store = useWorkspaceStore();

const open = ref(false);
const name = ref('');
const root = ref<HTMLElement | null>(null);
onClickOutside(root, () => { open.value = false; });

function toggle() {
  open.value = !open.value;
  if (open.value) store.refreshSaves();
}

async function save() {
  const n = name.value.trim();
  if (!n) return;
  await store.saveCurrent(n);
  name.value = '';
}

function load(id: string) {
  store.loadSave(id);
  open.value = false;
}

function fmt(ts: number) {
  return new Date(ts).toLocaleString([], {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
</script>

<template>
  <div ref="root" class="relative">
    <button
      class="text-xs px-3 py-1 btn-neutral"
      title="存檔 / 載入元件設定"
      @click="toggle"
    >💾 存檔</button>

    <div
      v-if="open"
      class="absolute right-0 mt-2 w-72 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl shadow-black/40 p-3 z-50"
    >
      <!-- Save current -->
      <div class="flex items-center gap-2">
        <input
          v-model="name"
          type="text"
          placeholder="存檔名稱…"
          class="flex-1 min-w-0 text-sm px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 focus:border-violet-500 text-zinc-100 outline-none"
          @keydown.enter="save"
        />
        <button
          class="text-sm px-3 py-1.5 btn-primary"
          :disabled="!name.trim()"
          @click="save"
        >儲存</button>
      </div>

      <!-- Saves list -->
      <div class="mt-3 border-t border-zinc-700/60 pt-2 max-h-72 overflow-y-auto no-scrollbar">
        <p v-if="!store.saves.length" class="text-xs text-zinc-500 py-3 text-center">
          尚無存檔。命名後按「儲存」保留目前設定。
        </p>
        <ul v-else class="space-y-1">
          <li
            v-for="s in store.saves"
            :key="s.id"
            class="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-700/60 transition-colors"
          >
            <button class="flex-1 min-w-0 text-left" :title="`載入「${s.name}」`" @click="load(s.id)">
              <span class="block text-sm text-zinc-100 truncate">{{ s.name }}</span>
              <span class="block text-xs text-zinc-500">{{ fmt(s.savedAt) }}</span>
            </button>
            <button
              class="text-xs px-2.5 py-1 rounded-full bg-zinc-700 text-zinc-200 hover:bg-violet-400 hover:text-violet-950 transition-colors"
              @click="load(s.id)"
            >載入</button>
            <button
              class="w-7 h-7 shrink-0 icon-btn hover:text-red-400"
              title="刪除此存檔"
              @click.stop="store.removeSave(s.id)"
            >✕</button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
