<script setup lang="ts">
import { ref } from 'vue';
import { useWorkspaceStore } from '../stores/workspace';

const store = useWorkspaceStore();
const isDragging = ref(false);
const uploading = ref(false);
const error = ref<string | null>(null);

// A prepared-but-not-yet-committed upload, held while we ask the user whether
// to keep or clear their existing frames (the "replace image" guard).
interface PendingUpload { base64: string; mediaType: string; width: number; height: number }
const pending = ref<PendingUpload | null>(null);

async function handleFile(file: File) {
  if (!file.type.startsWith('image/')) {
    error.value = 'Please upload an image file (PNG, JPG, WebP)';
    return;
  }
  error.value = null;
  uploading.value = true;
  try {
    const dataUrl = await fileToDataUrl(file);
    const img = await loadImage(dataUrl);
    const prepared: PendingUpload = { base64: dataUrl.split(',')[1], mediaType: file.type, width: img.width, height: img.height };
    // If the board already holds frames, don't silently overwrite — those frames
    // were drawn for the previous image. Ask before replacing.
    if (store.squares.length > 0) {
      pending.value = prepared;
      return;
    }
    await store.uploadImage(prepared.base64, prepared.mediaType, prepared.width, prepared.height);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to upload image';
  } finally {
    uploading.value = false;
  }
}

/** Commit the pending upload. `clear` wipes existing frames first (fresh start);
 * otherwise the new image is swapped in under the existing frames. */
async function commitPending(clear: boolean) {
  const p = pending.value;
  if (!p) {
    return;
  }
  pending.value = null;
  uploading.value = true;
  try {
    if (clear) {
      await store.reset();
    }
    await store.uploadImage(p.base64, p.mediaType, p.width, p.height);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to upload image';
  } finally {
    uploading.value = false;
  }
}

function cancelPending() {
  pending.value = null;
  uploading.value = false;
}

function onDrop(e: DragEvent) {
  isDragging.value = false;
  const file = e.dataTransfer?.files[0];
  if (file) {
    handleFile(file);
  }
}

function onFileInput(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // allow re-selecting the same file after cancel
  if (file) {
    handleFile(file);
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
</script>

<template>
  <div class="flex h-full items-center justify-center p-8">
    <div class="w-full max-w-lg">
      <h1 class="text-2xl font-bold text-white mb-2">bump-square</h1>
      <p class="text-zinc-400 mb-8 text-sm">
        Upload a design image, then ask Claude in your terminal to segment it.
        The agent reads this board live over MCP.
      </p>

      <div
        class="border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors"
        :class="isDragging ? 'border-blue-400 bg-blue-950/30' : 'border-zinc-600 hover:border-zinc-400'"
        @dragover.prevent="isDragging = true"
        @dragleave="isDragging = false"
        @drop.prevent="onDrop"
        @click="($refs.fileInput as HTMLInputElement).click()"
      >
        <div v-if="uploading" class="space-y-3">
          <div class="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p class="text-zinc-300 text-sm">Uploading…</p>
        </div>
        <div v-else class="space-y-3">
          <svg class="w-12 h-12 mx-auto text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p class="text-zinc-300">Drop image here or click to upload</p>
          <p class="text-zinc-500 text-xs">PNG, JPG, WebP supported</p>
        </div>
      </div>

      <p v-if="error" class="mt-4 text-red-400 text-sm">{{ error }}</p>

      <div class="mt-6 text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
        <p class="font-semibold text-zinc-400 mb-1">Next step</p>
        <p>After uploading, tell Claude: <span class="text-zinc-300">"segment the design"</span>.
        Claude will call <code class="text-blue-400">get_source_image</code> and
        <code class="text-blue-400">set_assets</code> to fill the panel.</p>
      </div>

      <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileInput" />
    </div>

    <!-- Replace-image guard: existing frames would be overwritten -->
    <div
      v-if="pending"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      @click.self="cancelPending"
    >
      <div class="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-xl p-5 shadow-xl">
        <h2 class="text-base font-semibold text-white mb-1">Replace image?</h2>
        <p class="text-sm text-zinc-400 mb-1">
          You have <span class="text-zinc-200 font-medium">{{ store.squares.length }}</span>
          frame{{ store.squares.length !== 1 ? 's' : '' }} drawn for the current image.
        </p>
        <p class="text-xs text-zinc-500 mb-4">
          <template v-if="store.sourceImage">current {{ store.sourceImage.width }}×{{ store.sourceImage.height }} → </template>
          new {{ pending.width }}×{{ pending.height }}
        </p>
        <div class="flex flex-col gap-2">
          <button
            class="w-full text-sm px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors"
            @click="commitPending(true)"
          >Start fresh — clear frames</button>
          <button
            class="w-full text-sm px-3 py-2 rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors"
            @click="commitPending(false)"
          >Keep my frames</button>
          <button
            class="w-full text-xs px-3 py-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
            @click="cancelPending"
          >Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>
