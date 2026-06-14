<script setup lang="ts">
/**
 * Named saves dropdown (header). Save the current board under a name, and
 * re-open / delete earlier saves. The list is fetched from the server; loading
 * replaces the live board (its new state arrives via SSE).
 */
import { ref, computed, nextTick } from 'vue';
import { onClickOutside } from '@vueuse/core';
import { useWorkspaceStore } from '~src/stores/workspace';
import { useT } from '~src/composables/useT';

const t = useT();
const store = useWorkspaceStore();

const open = ref(false);
const name = ref('');
const root = ref<HTMLElement | null>(null);
onClickOutside(root, () => { open.value = false; });

// Save As modal
const showSaveAs = ref(false);
const saveAsName = ref('');
const saveAsInput = ref<HTMLInputElement | null>(null);

const isDuplicate = computed(() =>
  saveAsName.value.trim() !== '' &&
  store.saves.some(s => s.name === saveAsName.value.trim())
);
const canConfirm = computed(() => saveAsName.value.trim() !== '' && !isDuplicate.value);

function toggle() {
  open.value = !open.value;
  if (open.value) store.refreshSaves();
}

async function save() {
  const n = name.value.trim();
  if (!n) return;
  await store.saveCurrent(n);
  name.value = '';
  open.value = false;
}

// Overwrite the currently-loaded save in place. The "儲存" button switches
// to this when a save was loaded (rather than starting from a fresh upload).
async function updateLoaded() {
  await store.updateCurrentSave();
  open.value = false;
}

function openSaveAs() {
  saveAsName.value = '';
  showSaveAs.value = true;
  nextTick(() => saveAsInput.value?.focus());
}

async function confirmSaveAs() {
  if (!canConfirm.value) return;
  await store.saveCurrent(saveAsName.value.trim());
  showSaveAs.value = false;
  saveAsName.value = '';
  open.value = false;
}

function closeSaveAs() {
  showSaveAs.value = false;
  saveAsName.value = '';
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
      class="text-xs px-3 py-1 btn-neutral flex items-center gap-1.5"
      :title="t('saves.menuTitle')"
      @click="toggle"
    >
      <span class="i-lucide-save" />
      <span>{{ t('saves.menu') }}</span>
    </button>

    <div
      v-if="open"
      class="absolute right-0 mt-2 w-72 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl shadow-black/40 p-3 z-50"
    >
      <!-- Quick save. Top section adapts: with a loaded save, show its name
           and overwrite on press; without one (fresh upload or post-reset),
           show the input and create a new entry. "另存新檔" below stays
           available in both states for explicit copy-out. -->
      <div v-if="store.currentSave" class="flex items-center gap-2 px-1">
        <div class="flex-1 min-w-0">
          <div class="text-xs text-zinc-500 leading-tight">{{ t('saves.loaded') }}</div>
          <div class="text-sm text-zinc-100 truncate font-medium">{{ store.currentSave.name }}</div>
        </div>
        <button
          class="text-sm px-3 py-1.5 btn-primary"
          :title="t('saves.overwriteTitle')"
          @click="updateLoaded"
        >{{ t('saves.save') }}</button>
      </div>
      <div v-else class="flex items-center gap-2">
        <input
          v-model="name"
          type="text"
          :placeholder="t('saves.namePlaceholder')"
          class="flex-1 min-w-0 text-sm px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 focus:border-violet-500 text-zinc-100 outline-none"
          @keydown.enter="save"
        />
        <button
          class="text-sm px-3 py-1.5 btn-primary"
          :disabled="!name.trim()"
          @click="save"
        >{{ t('saves.save') }}</button>
      </div>

      <!-- Save As button -->
      <button
        class="mt-2 w-full text-xs px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/60 transition-colors flex items-center gap-1.5"
        @click="openSaveAs"
      >
        <span class="i-lucide-file-plus" />
        <span>{{ t('saves.saveAs') }}</span>
      </button>

      <!-- Saves list -->
      <div class="mt-3 border-t border-zinc-700/60 pt-2 max-h-72 overflow-y-auto no-scrollbar">
        <p v-if="!store.saves.length" class="text-xs text-zinc-500 py-3 text-center">
          {{ t('saves.empty') }}
        </p>
        <ul v-else class="space-y-1">
          <li
            v-for="s in store.saves"
            :key="s.id"
            class="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-700/60 transition-colors"
          >
            <button class="flex-1 min-w-0 text-left" :title="`${t('saves.loadPrefix')}${s.name}${t('saves.loadSuffix')}`" @click="load(s.id)">
              <span class="block text-sm text-zinc-100 truncate">{{ s.name }}</span>
              <span class="block text-xs text-zinc-500">{{ fmt(s.savedAt) }}</span>
            </button>
            <button
              class="text-xs px-2.5 py-1 rounded-full bg-zinc-700 text-zinc-200 hover:bg-violet-400 hover:text-violet-950 transition-colors"
              @click="load(s.id)"
            >{{ t('saves.load') }}</button>
            <button
              class="w-7 h-7 shrink-0 icon-btn hover:text-red-400"
              :title="t('saves.delete')"
              @click.stop="store.removeSave(s.id)"
            >
              <span class="i-lucide-x" />
            </button>
          </li>
        </ul>
      </div>
    </div>

    <!-- Save As Modal. Teleport wrapped in v-if (not the inner div) — an
         always-mounted Teleport with empty contents emits an SSR placeholder
         that doesn't match the client's hydration shape, throwing a Vue
         "Hydration node mismatch" warning AND silently swallowing the very
         first click on any interactive element in the header while Vue
         repairs the tree. -->
    <Teleport v-if="showSaveAs" to="body">
      <div
        class="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        @click.self="closeSaveAs"
        @keydown.esc.capture="closeSaveAs"
      >
        <div class="bg-zinc-800 border border-zinc-700 rounded-2xl shadow-2xl shadow-black/60 p-6 w-80 max-w-[90vw]">
          <h3 class="text-sm font-semibold text-zinc-100 mb-4">{{ t('saves.modalTitle') }}</h3>

          <input
            ref="saveAsInput"
            v-model="saveAsName"
            type="text"
            :placeholder="t('saves.modalPlaceholder')"
            class="w-full text-sm px-3 py-2 rounded-lg bg-zinc-900 border text-zinc-100 outline-none transition-colors"
            :class="isDuplicate
              ? 'border-red-500 focus:border-red-500'
              : 'border-zinc-700 focus:border-violet-500'"
            @keydown.enter="confirmSaveAs"
            @keydown.esc.stop="closeSaveAs"
          />
          <p v-if="isDuplicate" class="mt-1.5 text-xs text-red-400">
            {{ t('saves.dupPrefix') }}{{ saveAsName.trim() }}{{ t('saves.dupSuffix') }}
          </p>

          <div class="mt-5 flex justify-end gap-2">
            <button class="text-sm px-4 py-1.5 btn-neutral" @click="closeSaveAs">{{ t('saves.cancel') }}</button>
            <button
              class="text-sm px-4 py-1.5 btn-primary"
              :disabled="!canConfirm"
              @click="confirmSaveAs"
            >{{ t('saves.save') }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
