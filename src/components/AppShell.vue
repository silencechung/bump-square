<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref, watch } from 'vue';
import { useWorkspaceStore } from '~src/stores/workspace';
import UploadPanel from './UploadPanel.vue';
import WorkspaceCanvas from './WorkspaceCanvas.vue';
import AgentPanel from './AgentPanel.vue';
import AgentPanelToggle from './AgentPanelToggle.vue';
import StructureView from './StructureView.vue';
import SavesMenu from './SavesMenu.vue';
import TerminalPanel from './TerminalPanel.vue';
import SkillInstallBanner from './SkillInstallBanner.vue';
import AnnotationDot from './AnnotationDot.vue';
import AnnotationOverlay from './AnnotationOverlay.vue';
import { useAnnotations } from '~src/composables/useAnnotations';
import { useT } from '~src/composables/useT';
import type { Locale } from '~src/i18n';

// Astro page passes the server-side locale here so SSR matches the persisted
// preference. The SSE channel still wins once the socket is up; this is just
// the seed value that prevents a "flash of default locale" on first paint.
const props = defineProps<{ initialLocale?: Locale }>();

const store = useWorkspaceStore();
if (props.initialLocale) {
  store.locale = props.initialLocale;
}
const { annotationMode, toggleMode } = useAnnotations();
const t = useT();


onMounted(() => {
  store.connect();
  window.addEventListener('keydown', onGlobalKeyDown);
});
onUnmounted(() => window.removeEventListener('keydown', onGlobalKeyDown));

/** VSCode-style Ctrl+` (backtick) toggles the bottom terminal panel.
 *
 * Intentionally NO typing-guard — VSCode toggles the terminal regardless of
 * focus, and the previous guard silently swallowed every press because the
 * xterm panel mounts a hidden <textarea> for accessibility, so when the panel
 * was open focus often landed there. Bare ` still works in any text editor
 * (Ctrl is required for the toggle), so this doesn't disrupt markdown typing.
 *
 * Uses e.code ('Backquote' — the physical key) so non-US layouts still hit it. */
function onGlobalKeyDown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.code === 'Backquote') {
    e.preventDefault();
    terminalOpen.value = !terminalOpen.value;
  }
}

const steps = ['upload', 'layout', 'structure'] as const;
const stepLabels: Record<string, string> = {
  upload: 'Upload',
  layout: 'Layout',
  structure: 'Structure',
};
// Each step's purpose, surfaced as a tooltip so the nav isn't ambiguous.
const stepTitles = computed<Record<string, string>>(() => ({
  upload: t('header.step.upload'),
  layout: t('header.step.layout'),
  structure: t('header.step.structure'),
}));

const hasStructure = computed(() => !!store.structure.tree);
const hasSquares = computed(() => store.squares.length > 0);
const busy = computed(() => store.runningKind !== null);

// Latest save path → copy to clipboard so downstream reader skill / agent
// can be told exactly which file to read. Briefly flips the icon to ✓ as
// visual feedback (no toast library).
const latestSave = computed(() => store.saves[0] ?? null);
const copyFeedback = ref(false);
async function copyLatestSavePath() {
  if (!latestSave.value) {
    return;
  }
  try {
    await navigator.clipboard.writeText(latestSave.value.path);
    copyFeedback.value = true;
    setTimeout(() => { copyFeedback.value = false; }, 1500);
  } catch { /* clipboard blocked — ignore silently */ }
}

// Claude-calling actions, surfaced in the header so the user always knows
// "what the AI can do right now" — visibility is independent of the current
// step, gated only by data prerequisites. 0.2.0 collapsed the previous
// 🧩 Structure + ✨ Assets pair into a single Spec button (both wrote into
// `structure.prompt.*` anyway, share one `promptVersion`; one click =
// complete spec); 💡 Suggest is reserved for #11.
const aiActions = computed(() => [
  {
    kind: 'generate-spec',
    label: t('header.ai.spec.label'),
    runningLabel: t('header.ai.spec.running'),
    canRun: hasSquares.value,
    why: hasSquares.value ? t('header.ai.spec.why') : t('header.ai.spec.gate'),
  },
]);

// Right-side agent panel is collapsible to give the canvas more room.
const agentOpen = ref(true);

// Bottom terminal panel: default closed, toggled by the >_ button in the header.
// Auto-opens on first claude run so users discover the progress view; if they
// manually close it mid-run we respect that choice (don't re-open).
const terminalOpen = ref(false);
let autoOpenedOnce = false;
watch(() => store.terminalRunning, (running) => {
  if (running && !autoOpenedOnce) {
    terminalOpen.value = true;
    autoOpenedOnce = true;
  }
});

// Reset is destructive (wipes the whole board), so it's a two-click confirm:
// first click arms it ("確定清空？"), second within 3s actually resets. Auto-
// disarms so a stray first click can't leave it primed indefinitely.
const confirmingReset = ref(false);
let resetTimer: ReturnType<typeof setTimeout> | null = null;
function onResetClick() {
  if (confirmingReset.value) {
    if (resetTimer) {
      clearTimeout(resetTimer);
    }
    confirmingReset.value = false;
    store.reset();
    return;
  }
  confirmingReset.value = true;
  resetTimer = setTimeout(() => {
    confirmingReset.value = false;
  }, 3000);
}

function canVisit(s: string): boolean {
  if (s === 'upload') {
    return true;
  }
  if (s === 'structure') {
    return hasStructure.value;
  }
  return !!store.sourceImage;
}
</script>

<template>
  <div class="fixed inset-0 overflow-hidden flex flex-col bg-zinc-900 text-zinc-100">
    <header class="h-11 shrink-0 border-b border-zinc-800 flex items-center px-4 gap-4">
      <!-- Brand lockup. Inert — breadcrumb owns step navigation.
           Two-tone wordmark: "Square" picks up the lighter mark square's
           violet so the SVG and the text read as one unit. -->
      <div class="flex items-center gap-2 select-none">
        <svg viewBox="0 0 128 128" class="w-5 h-5 shrink-0" aria-hidden="true">
          <rect x="26" y="46" width="56" height="56" rx="14" fill="#a78bfa" />
          <rect x="46" y="26" width="56" height="56" rx="14" fill="#7c3aed" />
        </svg>
        <span class="text-sm flex items-center">
          <span class="font-medium text-zinc-100">Bump</span>
          <span class="ml-1.5 font-semibold text-violet-400 border border-violet-400 rounded-md p-1 leading-none tracking-wider">SQUARE</span>
        </span>
      </div>
      <!-- Breadcrumb steps as chevron tabs: the triangular edge shows direction. -->
      <div class="relative flex items-center gap-0.5">
        <button
          v-for="s in steps"
          :key="s"
          class="text-sm pl-7 pr-8 py-1.5 font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed [clip-path:polygon(0_0,calc(100%_-_10px)_0,100%_50%,calc(100%_-_10px)_100%,0_100%,10px_50%)]"
          :class="store.step === s ? 'bg-violet-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'"
          :disabled="!canVisit(s)"
          :title="stepTitles[s]"
          @click="store.step = s as typeof store.step"
        >{{ stepLabels[s] }}</button>
        <AnnotationDot area="breadcrumb" pos="-top-0.5 -right-0.5" />
      </div>
      <div class="ml-auto flex items-center gap-3">
        <span
          v-if="hasStructure && store.step !== 'structure'"
          class="text-xs text-emerald-400 cursor-pointer hover:underline flex items-center gap-1"
          @click="store.step = 'structure'"
        >
          <span class="i-lucide-check-circle" />
          <span>structure ready</span>
          <span class="i-lucide-arrow-right" />
        </span>
        <!-- Save cluster: SavesMenu + copy-latest-path button. Paired because
             "copy save path" is conceptually a save operation (it's the export
             handoff the downstream reader skill consumes). -->
        <div class="relative flex items-center gap-2">
          <SavesMenu />
          <!-- Copy latest save path → for downstream reader skill. Mirrors the
               SavesMenu button's icon+text shape, so they read as a pair. -->
          <button
            class="text-xs px-3 py-1 btn-neutral flex items-center gap-1.5"
            :class="{
              'text-emerald-300': copyFeedback,
              'opacity-40 cursor-default': !latestSave,
            }"
            :disabled="!latestSave"
            :title="latestSave
              ? (copyFeedback ? t('header.copy.tipDone') : `${t('header.copy.tipPrefix')}${latestSave.name}${t('header.copy.tipSuffix')}`)
              : t('header.copy.tipEmpty')"
            @click="copyLatestSavePath"
          >
            <span :class="copyFeedback ? 'i-lucide-clipboard-check' : 'i-lucide-clipboard'" />
            <span>{{ copyFeedback ? t('header.copy.done') : t('header.copy.action') }}</span>
          </button>
          <AnnotationDot area="save-cluster" pos="-top-1 -right-1" />
        </div>

        <!-- AI actions cluster — every button here calls `claude --print`.
             Unified violet→cyan gradient + sparkle prefix marks them as AI-driven.
             Each spins only when its own kind is in flight (no more linkage).
             gap-2 matches the Saves cluster's button rhythm so the header reads
             as one consistent grid rather than two competing tempos. -->
        <div class="relative flex items-center gap-2 pl-3 border-l border-zinc-700">
          <span class="text-[10px] text-zinc-500 uppercase tracking-wider pr-1">AI</span>
          <button
            v-for="a in aiActions"
            :key="a.kind"
            class="ai-btn"
            :class="{
              'ai-btn-running': store.runningKind === a.kind,
              'ai-btn-idle': store.runningKind !== a.kind,
            }"
            :disabled="!a.canRun || busy"
            :title="store.runningKind === a.kind
              ? `${t('header.ai.runningPrefix')}${a.kind}${t('header.ai.runningSuffix')}`
              : busy
                ? t('header.ai.busyOther')
                : a.why"
            @click="store.runClaude(a.kind)"
          >
            <span
              v-if="store.runningKind === a.kind"
              class="i-lucide-loader-2 animate-spin"
            />
            <span v-else class="i-lucide-sparkles" />
            <span>{{ store.runningKind === a.kind ? a.runningLabel : a.label }}</span>
          </button>
          <AnnotationDot area="ai-cluster" pos="-top-1 -right-1" />
        </div>

        <!-- Destructive: kept apart from save / AI clusters by its own separator
             so it can't be mis-clicked while reaching for the AI buttons. -->
        <div class="relative flex items-center pl-3 border-l border-zinc-700">
          <button
            class="text-xs px-3 py-1 rounded-full font-medium transition-colors flex items-center gap-1.5"
            :class="confirmingReset
              ? 'bg-red-500 text-white hover:bg-red-400'
              : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600 hover:text-red-400'"
            :title="confirmingReset ? t('header.reset.armedTitle') : t('header.reset.idleTitle')"
            @click="onResetClick"
          >
            <span class="i-lucide-trash-2" />
            <span>{{ confirmingReset ? t('header.reset.armedLabel') : t('header.reset.idleLabel') }}</span>
          </button>
          <AnnotationDot area="reset" pos="-top-1 -right-1" />
        </div>

        <!-- Meta cluster: locale toggle + annotation toggle. Wrapped in the
             same bordered shell as Reset / AI clusters so the header reads
             as 4 evenly-separated groups, not "3 clusters + 2 hanging icons".
             CJK '繁' needs more optical size than latin 'Reset' next to it
             (CJK glyphs read smaller at the same px), so text-sm + min-w-8. -->
        <div class="relative flex items-center gap-1 pl-3 border-l border-zinc-700">
          <button
            type="button"
            class="text-zinc-300 hover:text-violet-300 transition-colors flex items-center justify-center h-7 min-w-8 px-2 rounded-full text-sm font-medium tracking-wide tabular-nums"
            :title="store.locale === 'zh-TW' ? t('header.locale.toEn') : t('header.locale.toZh')"
            aria-label="toggle locale"
            @click="store.toggleLocale()"
          >
            {{ store.locale === 'zh-TW' ? '繁' : 'EN' }}
          </button>
          <button
            type="button"
            class="text-zinc-400 hover:text-violet-300 transition-colors flex items-center justify-center w-7 h-7 rounded-full"
            :class="annotationMode ? 'text-violet-300 bg-violet-500/15 shadow-[0_0_10px_-2px_rgba(167,139,250,0.6)]' : ''"
            :title="annotationMode ? t('header.annotation.on') : t('header.annotation.off')"
            aria-label="toggle annotation mode"
            :aria-pressed="annotationMode"
            @click="toggleMode"
          >
          <span class="i-lucide-help-circle text-base" />
        </button>
        </div>
      </div>
    </header>

    <AnnotationOverlay />

    <UploadPanel v-if="store.step === 'upload'" />

    <div
      v-else-if="store.step === 'layout'"
      class="flex-1 flex overflow-hidden"
    >
      <WorkspaceCanvas />
      <AgentPanel v-if="agentOpen" @collapse="agentOpen = false" />
      <AgentPanelToggle v-else @expand="agentOpen = true" />
    </div>

    <div v-else-if="store.step === 'structure'" class="flex-1 flex overflow-hidden">
      <StructureView />
      <AgentPanel v-if="agentOpen" @collapse="agentOpen = false" />
      <AgentPanelToggle v-else @expand="agentOpen = true" />
    </div>

    <TerminalPanel :open="terminalOpen" @close="terminalOpen = false" />

    <!-- VSCode-style status bar: terminal toggle bottom-left, plus running
         status. Always visible, sits below the (collapsible) terminal panel. -->
    <footer class="shrink-0 h-6 border-t border-zinc-800 bg-zinc-950 flex items-center px-2 text-[11px] text-zinc-400 select-none">
      <button
        class="status-toggle"
        :class="{ 'status-toggle-open': terminalOpen, 'status-toggle-busy': busy }"
        :title="t('header.terminal.toggle')"
        @click="terminalOpen = !terminalOpen"
      >
        <span class="i-lucide-terminal" />
        <span class="font-mono">claude --print</span>
        <span v-if="busy" class="busy-dot" />
        <span v-if="busy" class="text-amber-400">{{ store.runningKind }}</span>
      </button>
      <span class="ml-auto pr-1 text-zinc-600">
        <span v-if="store.connected" class="text-emerald-500">●</span>
        <span v-else class="text-red-500">●</span>
        SSE
      </span>
    </footer>

    <SkillInstallBanner />
  </div>
</template>

<style scoped>
/* Visual signature for "this button calls claude --print". Distinct gradient
   so users instantly recognise AI actions vs local UI controls (Reset, Saves,
   step tabs). */
.ai-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.3rem 0.7rem;
  border-radius: 9999px;
  transition: filter 0.15s, transform 0.15s, opacity 0.15s;
}
.ai-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.ai-btn:not(:disabled):hover {
  filter: brightness(1.12);
  transform: translateY(-0.5px);
}
.ai-btn-idle {
  background: linear-gradient(135deg, rgb(124 58 237) 0%, rgb(6 182 212) 100%);
  color: white;
  box-shadow: 0 0 0 1px rgba(124, 58, 237, 0.35);
}
.ai-btn-running {
  background: linear-gradient(135deg, rgb(251 191 36) 0%, rgb(245 158 11) 100%);
  color: rgb(120 53 15);
  animation: ai-pulse-bg 1.4s ease-in-out infinite;
}
@keyframes ai-pulse-bg {
  0%, 100% { box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.6); }
  50%      { box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.25); }
}
.ai-pulse {
  display: inline-block;
  animation: ai-spin 1.4s linear infinite;
}
@keyframes ai-spin {
  0%, 100% { transform: rotate(0deg); }
  50%      { transform: rotate(180deg); }
}

/* Bottom status bar: thin VSCode-like strip with the terminal toggle on the
   left. Distinct from header so users don't conflate "AI actions" (top-right,
   purple/cyan) with "panel toggle" (bottom-left, neutral). */
.status-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0 0.6rem;
  height: 100%;
  color: rgb(212 212 216);
  transition: background-color 0.15s;
}
.status-toggle:hover {
  background: rgb(63 63 70);
}
.status-toggle-open {
  background: rgb(124 58 237);
  color: white;
}
.status-toggle-open:hover {
  background: rgb(139 92 246);
}
.status-toggle-busy:not(.status-toggle-open) {
  color: rgb(251 191 36);
}
.busy-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: rgb(251 191 36);
  animation: status-dot-pulse 1.2s ease-in-out infinite;
}
@keyframes status-dot-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.35; }
}
</style>
