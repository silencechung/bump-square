<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import '@xterm/xterm/css/xterm.css';
import { useWorkspaceStore } from '~src/stores/workspace';
import AnnotationDot from './AnnotationDot.vue';
import { useT } from '~src/composables/useT';

const t = useT();
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();
const store = useWorkspaceStore();

const containerRef = ref<HTMLElement | null>(null);
const HEIGHT_DEFAULT = 240;
const HEIGHT_MIN = 80;
const HEIGHT_MAX = 600;

const panelHeight = ref(HEIGHT_DEFAULT);

// --- xterm (dynamic import: DOM-only library, can't run in SSR) ---
let term: import('@xterm/xterm').Terminal | null = null;
let fitAddon: import('@xterm/addon-fit').FitAddon | null = null;
let es: EventSource | null = null;
let ro: ResizeObserver | null = null;

async function initTerminal() {
  if (!containerRef.value || term) return;

  const { Terminal } = await import('@xterm/xterm');
  const { FitAddon } = await import('@xterm/addon-fit');

  term = new Terminal({
    disableStdin: true,
    convertEol: true,
    theme: { background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#d4d4d4' },
    fontFamily: 'monospace',
    fontSize: 13,
    scrollback: 5000,
  });

  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(containerRef.value);
  fitAddon.fit();

  ro = new ResizeObserver(() => fitAddon?.fit());
  ro.observe(containerRef.value);

  connectSSE();
}

function connectSSE() {
  if (es) return;
  es = new EventSource('/api/terminal/events');
  es.addEventListener('chunk', (e) => {
    if (!term) return;
    try {
      const text = decodeURIComponent(escape(atob((e as MessageEvent).data)));
      term.write(text);
    } catch { /* ignore decode errors */ }
  });
  es.addEventListener('clear', () => term?.clear());
  es.addEventListener('status', (e) => {
    store.setRunningKind(JSON.parse((e as MessageEvent).data).kind ?? null);
  });
}

function disconnectSSE() {
  es?.close();
  es = null;
}

watch(() => props.open, async (isOpen) => {
  if (isOpen) {
    await new Promise(r => setTimeout(r, 50)); // wait for DOM
    if (!term) {
      await initTerminal();
    } else {
      fitAddon?.fit();
    }
    if (!es) connectSSE();
  } else {
    disconnectSSE();
  }
}, { immediate: false });

onMounted(async () => {
  if (props.open) await initTerminal();
});

onUnmounted(() => {
  disconnectSSE();
  ro?.disconnect();
  term?.dispose();
  term = null;
});

// --- Drag to resize ---
let dragStartY = 0;
let dragStartH = 0;

function onDragStart(e: PointerEvent) {
  dragStartY = e.clientY;
  dragStartH = panelHeight.value;
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);
}

function onDragMove(e: PointerEvent) {
  const delta = dragStartY - e.clientY; // drag up = taller
  panelHeight.value = Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, dragStartH + delta));
  fitAddon?.fit();
}

function onDragEnd() {
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
}
</script>

<template>
  <div
    v-show="open"
    class="shrink-0 flex flex-col border-t border-zinc-700 bg-[#1e1e1e] select-none overflow-hidden transition-[height] duration-150"
    :style="{ height: panelHeight + 'px' }"
  >
    <!-- Drag handle -->
    <div
      class="h-1 cursor-row-resize hover:bg-violet-500 transition-colors"
      @pointerdown.prevent="onDragStart"
    />

    <!-- Toolbar -->
    <div class="relative flex items-center gap-2 px-3 py-1 border-b border-zinc-700 shrink-0">
      <span class="text-xs text-zinc-400 font-mono select-none">claude --print</span>
      <AnnotationDot area="terminal-panel" pos="top-1 left-[120px]" />
      <div class="ml-auto flex items-center gap-1">
        <button
          class="w-7 h-7 icon-btn hover:text-red-400"
          :title="t('terminal.clear')"
          @click="term?.clear()"
        >
          <span class="i-lucide-trash-2" />
        </button>
        <button
          class="w-7 h-7 icon-btn hover:text-zinc-100"
          :title="t('terminal.close')"
          @click="emit('close')"
        >
          <span class="i-lucide-x" />
        </button>
      </div>
    </div>

    <!-- xterm mount point -->
    <div ref="containerRef" class="flex-1 overflow-hidden px-1" />
  </div>
</template>
