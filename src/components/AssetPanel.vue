<script setup lang="ts">
import { useWorkspaceStore } from '../stores/workspace';
import type { Asset } from '../types';

const store = useWorkspaceStore();

const typeColors: Record<string, string> = {
  icon: 'bg-purple-900/60 text-purple-300',
  text: 'bg-blue-900/60 text-blue-300',
  line: 'bg-zinc-700 text-zinc-300',
  shape: 'bg-green-900/60 text-green-300',
  image: 'bg-amber-900/60 text-amber-300',
  component: 'bg-rose-900/60 text-rose-300',
};

/** Crop the source image to the asset's bounding box via CSS background. */
function cropStyle(asset: Asset): Record<string, string> {
  const img = store.sourceImage;
  if (!img || !asset.width || !asset.height) {
    return {};
  }
  const box = 40;
  const scale = Math.min(box / asset.width, box / asset.height);
  return {
    backgroundImage: `url(${img.url})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${img.width * scale}px ${img.height * scale}px`,
    backgroundPosition: `${-asset.x * scale + (box - asset.width * scale) / 2}px ${-asset.y * scale + (box - asset.height * scale) / 2}px`,
  };
}

function selectAsset(id: string) {
  store.selectedAssetId = store.selectedAssetId === id ? null : id;
}

function onCommentInput(asset: Asset, e: Event) {
  store.updateAsset(asset.id, { comment: (e.target as HTMLInputElement).value });
}

function startDrag(e: DragEvent, assetId: string) {
  e.dataTransfer?.setData('assetId', assetId);
}
</script>

<template>
  <aside class="w-64 shrink-0 bg-zinc-800 border-r border-zinc-700/60 flex flex-col overflow-hidden">
    <div class="p-3 border-b border-zinc-700/60">
      <h2 class="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
        Assets <span class="text-zinc-500">({{ store.assets.length }})</span>
      </h2>
    </div>

    <div class="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar p-2 space-y-1">
      <div v-if="store.assets.length === 0" class="text-zinc-600 text-xs text-center pt-8 px-3 leading-relaxed">
        No assets yet. Ask Claude to <span class="text-zinc-400">"segment the design"</span> in your terminal.
      </div>

      <div
        v-for="asset in store.assets"
        :key="asset.id"
        class="rounded-lg cursor-pointer border transition-all"
        :class="store.selectedAssetId === asset.id
          ? 'border-blue-500 bg-blue-950/40'
          : 'border-transparent hover:border-zinc-700 hover:bg-zinc-800/50'"
        draggable="true"
        @dragstart="startDrag($event, asset.id)"
        @click="selectAsset(asset.id)"
      >
        <div class="p-2 flex items-center gap-2">
          <div class="w-10 h-10 rounded bg-zinc-800 border border-zinc-700 shrink-0 overflow-hidden" :style="cropStyle(asset)" />
          <div class="min-w-0">
            <p class="text-xs text-zinc-200 truncate">{{ asset.label }}</p>
            <span class="text-[10px] px-1.5 py-0.5 rounded" :class="typeColors[asset.type] ?? 'bg-zinc-700 text-zinc-400'">{{ asset.type }}</span>
          </div>
        </div>

        <div v-if="store.selectedAssetId === asset.id" class="px-2 pb-2">
          <input
            type="text"
            placeholder="Add comment…"
            :value="asset.comment ?? ''"
            class="w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500"
            @input="onCommentInput(asset, $event)"
            @click.stop
          />
        </div>
      </div>
    </div>
  </aside>
</template>
