<script setup lang="ts">
import { useWorkspaceStore } from '~src/stores/workspace';
import { computed, ref } from 'vue';
import MarkdownIt from 'markdown-it';
import StructureTree from './StructureTree.vue';
import AnnotationDot from './AnnotationDot.vue';
import { treeToConsole } from '~src/lib/structureText';
import { useT } from '~src/composables/useT';

const t = useT();
const store = useWorkspaceStore();

// html:false escapes any raw HTML in the prompt (frame comments are semi-trusted
// user content), so rendering the output via v-html is safe from injection.
const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

// Prompt view: rendered markdown preview vs editable source.
const promptView = ref<'preview' | 'source'>('preview');

const viewMode = ref<'tree' | 'prompt'>('tree');
const tabs = [
  { id: 'tree', label: 'Tree' },
  { id: 'prompt', label: 'Prompt' },
] as const;

// The agent handoff: a console tree auto-derived from the confirmed structure,
// so what the user sees is exactly what gets handed to the build agent.
const consoleTree = computed(() => treeToConsole(store.structure.tree));

// Assets section of the spec — stored at `structure.prompt.assets` since
// 0.2.0, written in the same `generate-spec` agent run as `prompt.structure`
// (one Spec button, one stamp). Rendered after the structure section.
const assetsSection = computed(() =>
  store.structure.prompt.assets ? `\n\n${store.structure.prompt.assets}` : ''
);
// What the prompt shows when the user hasn't hand-edited it: tree + assets.
const derivedPrompt = computed(() => consoleTree.value + assetsSection.value);

// The prompt is EDITABLE before sending: promptDraft is null until the user
// types, in which case it overrides the derived content. effectivePrompt is
// what actually gets copied / handed off. Resetting drops back to derived.
const promptDraft = ref<string | null>(null);
const effectivePrompt = computed(() => promptDraft.value ?? derivedPrompt.value);
const isEdited = computed(() => promptDraft.value !== null && promptDraft.value !== derivedPrompt.value);

function resetPrompt() {
  promptDraft.value = null;
}

const renderedPrompt = computed(() => md.render(effectivePrompt.value || ''));

function copyHandoff() {
  if (effectivePrompt.value) {
    navigator.clipboard.writeText(effectivePrompt.value);
  }
}
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden p-6 gap-4">
    <div class="relative flex items-center justify-between">
      <h2 class="text-sm font-semibold text-zinc-300">{{ t('structure.heading') }}</h2>
      <span class="text-xs text-zinc-500">{{ t('structure.hint') }}</span>
      <AnnotationDot area="structure-view" pos="-top-1 left-[148px]" />
    </div>

    <!-- Stale-snapshot banner. structure.prompt is a server-stamped snapshot;
         any board edit bumps `boardVersion` past `structure.promptVersion` and
         this banner appears. Two independent signals (Prompt vs Assets prompt)
         are surfaced together so the user knows which agent action to re-run. -->
    <div
      v-if="store.isPromptStale || store.isAssetsPromptStale"
      class="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 flex items-start gap-2 text-sm text-amber-100"
    >
      <span class="i-lucide-triangle-alert text-amber-300 text-base mt-0.5 shrink-0" />
      <div class="flex-1 leading-snug">
        <div class="font-medium text-amber-200">
          {{ t('structure.stale.headline') }}
        </div>
        <div class="text-xs text-amber-100/80 mt-0.5">
          <span v-if="store.isPromptStale">{{ t('structure.stale.prompt') }}</span>
          <span v-if="store.isAssetsPromptStale">{{ t('structure.stale.assets') }}</span>
        </div>
      </div>
    </div>

    <!-- Three tabs over one pane: Tree (visual) · JSON (raw) · Prompt (the
         console-tree handoff sent to the dev agent). -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <div class="flex items-center gap-2 mb-2">
        <div class="flex items-center gap-0.5 text-sm font-medium">
          <button
            v-for="(tab, i) in tabs"
            :key="tab.id"
            class="px-6 py-2 transition-colors"
            :class="[
              viewMode === tab.id ? 'bg-violet-300 text-violet-950' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600',
              i === 0 ? 'rounded-l-full' : '',
              i === tabs.length - 1 ? 'rounded-r-full' : '',
            ]"
            @click="viewMode = tab.id"
          >{{ tab.label }}</button>
        </div>
        <div v-if="viewMode === 'prompt'" class="ml-auto flex items-center gap-3">
          <span v-if="isEdited" class="text-sm text-amber-400 flex items-center gap-1">
            <span class="i-lucide-pencil" />
            <span>{{ t('structure.edited') }}</span>
          </span>
          <button
            v-if="isEdited"
            class="text-sm px-4 py-1.5 btn-neutral"
            title="Discard edits, revert to the structure-derived prompt"
            @click="resetPrompt"
          >{{ t('structure.reset') }}</button>
          <!-- Preview (rendered md) ⟷ Source (editable) toggle -->
          <button
            type="button"
            role="switch"
            :aria-checked="promptView === 'source'"
            class="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            :title="t('structure.toggleTitle')"
            @click="promptView = promptView === 'preview' ? 'source' : 'preview'"
          >
            <span>{{ t('structure.source') }}</span>
            <span
              class="relative w-11 h-6 rounded-full transition-colors"
              :class="promptView === 'source' ? 'bg-violet-400' : 'bg-zinc-600'"
            >
              <span
                class="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                :class="promptView === 'source' ? 'left-[22px]' : 'left-0.5'"
              ></span>
            </span>
          </button>
          <button
            class="text-sm px-4 py-1.5 btn-neutral"
            title="Copy the handoff prompt"
            @click="copyHandoff"
          >Copy</button>
        </div>
      </div>

      <!-- Tree -->
      <div
        v-if="viewMode === 'tree'"
        class="flex-1 overflow-auto no-scrollbar bg-zinc-900 border border-zinc-800 rounded-lg p-4"
      >
        <StructureTree v-if="store.structure.tree" :node="store.structure.tree" root />
        <p v-else class="text-sm text-zinc-600">No structure yet — generate it from the Layout step.</p>
      </div>
      <!-- Prompt — the markdown handoff to the dev agent. Preview (rendered) by
           default; switch to source to edit before send. An optional
           agent-generated assets prompt is appended at the bottom. -->
      <div v-else class="flex-1 flex flex-col overflow-hidden gap-2">
        <!-- Rendered markdown preview -->
        <div
          v-if="promptView === 'preview'"
          class="md-body flex-1 overflow-auto no-scrollbar bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-200"
          v-html="renderedPrompt"
        ></div>
        <!-- Editable source -->
        <textarea
          v-else
          :value="effectivePrompt"
          spellcheck="false"
          wrap="off"
          placeholder="No structure yet — generate it from the Layout step."
          class="flex-1 overflow-auto no-scrollbar resize-none whitespace-pre bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-lg p-4 text-sm text-zinc-200 font-mono leading-relaxed outline-none"
          @input="promptDraft = ($event.target as HTMLTextAreaElement).value"
        ></textarea>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Minimal prose styling for the rendered markdown prompt (no typography plugin).
   :deep() is needed because the markup is injected via v-html. */
.md-body :deep(h1),
.md-body :deep(h2),
.md-body :deep(h3) {
  font-weight: 600;
  color: rgb(228 228 231);            /* zinc-200 */
  margin: 1.1rem 0 0.5rem;
}
.md-body :deep(h2) { font-size: 0.95rem; }
.md-body :deep(*:first-child) { margin-top: 0; }
.md-body :deep(ul) {
  list-style: disc;
  padding-left: 1.25rem;
  margin: 0.25rem 0;
}
.md-body :deep(li) { margin: 0.15rem 0; }
.md-body :deep(li)::marker { color: rgb(139 92 246); } /* violet-500 */
.md-body :deep(strong) { color: rgb(244 244 245); font-weight: 600; } /* zinc-100 */
.md-body :deep(p) { margin: 0.4rem 0; }
.md-body :deep(blockquote) {
  border-left: 2px solid rgb(82 82 91);  /* zinc-600 */
  padding-left: 0.75rem;
  color: rgb(161 161 170);               /* zinc-400 */
  margin: 0.4rem 0;
}
.md-body :deep(code) {
  background: rgb(39 39 42);             /* zinc-800 */
  padding: 0.05rem 0.3rem;
  border-radius: 0.25rem;
  font-size: 0.85em;
}
/* Code fence (the ASCII 結構 tree): darker block, monospace shape preserved. */
.md-body :deep(pre) {
  background: rgb(9 9 11);               /* zinc-950 */
  border: 1px solid rgb(39 39 42);       /* zinc-800 */
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  overflow-x: auto;
  margin: 0.4rem 0;
}
.md-body :deep(pre code) {
  background: none;
  padding: 0;
  border-radius: 0;
  font-size: 0.85em;
  line-height: 1.55;
  color: rgb(212 212 216);               /* zinc-300 */
}
.md-body :deep(a) { color: rgb(167 139 250); text-decoration: underline; } /* violet-300 */
</style>
