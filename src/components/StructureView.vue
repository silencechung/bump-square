<script setup lang="ts">
import { useWorkspaceStore } from '../stores/workspace';
import { computed, ref } from 'vue';
import MarkdownIt from 'markdown-it';
import StructureTree from './StructureTree.vue';
import { treeToConsole } from '../lib/structureText';

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

// Optional agent-authored assets-generation prompt, appended at the very bottom.
const assetsSection = computed(() =>
  store.structure.assetsPrompt ? `\n\n${store.structure.assetsPrompt}` : ''
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

const assetsPending = computed(() => store.isRequestPending('suggest-assets'));

const renderedPrompt = computed(() => md.render(effectivePrompt.value || ''));

function copyHandoff() {
  if (effectivePrompt.value) navigator.clipboard.writeText(effectivePrompt.value);
}
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden p-6 gap-4">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold text-zinc-300">Generated Structure</h2>
      <div class="flex items-center gap-2">
        <!-- Stage 3 — hand the confirmed spec off to the dev agent. -->
        <button
          class="text-sm px-5 py-1.5 btn font-medium"
          :class="store.isRequestPending('handoff')
            ? 'bg-amber-300 text-amber-950 hover:bg-amber-200'
            : 'bg-violet-400 text-violet-950 hover:bg-violet-300'"
          :disabled="!store.structure.tree"
          :title="store.isRequestPending('handoff')
            ? 'Handing off… click to cancel'
            : 'Send this confirmed console-tree spec to the dev agent to build'"
          @click="store.isRequestPending('handoff') ? store.cancelAgentRequest('handoff') : store.requestAgent('handoff', effectivePrompt)"
        >{{ store.isRequestPending('handoff') ? '⏳ 送交中… ✕' : '🚀 送交開發' }}</button>
      </div>
    </div>

    <!-- Three tabs over one pane: Tree (visual) · JSON (raw) · Prompt (the
         console-tree handoff sent to the dev agent). -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <div class="flex items-center gap-2 mb-2">
        <div class="flex items-center gap-0.5 text-sm font-medium">
          <button
            v-for="(t, i) in tabs"
            :key="t.id"
            class="px-6 py-2 transition-colors"
            :class="[
              viewMode === t.id ? 'bg-violet-300 text-violet-950' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600',
              i === 0 ? 'rounded-l-full' : '',
              i === tabs.length - 1 ? 'rounded-r-full' : '',
            ]"
            @click="viewMode = t.id"
          >{{ t.label }}</button>
        </div>
        <div v-if="viewMode === 'prompt'" class="ml-auto flex items-center gap-3">
          <span v-if="isEdited" class="text-sm text-amber-400">✏ 已編輯</span>
          <button
            v-if="isEdited"
            class="text-sm px-4 py-1.5 btn-neutral"
            title="Discard edits, revert to the structure-derived prompt"
            @click="resetPrompt"
          >重設</button>
          <!-- Preview (rendered md) ⟷ Source (editable) toggle -->
          <button
            type="button"
            role="switch"
            :aria-checked="promptView === 'source'"
            class="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            title="切換：預覽（渲染）／原始碼（可編輯）"
            @click="promptView = promptView === 'preview' ? 'source' : 'preview'"
          >
            <span>原始碼</span>
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
        <div class="flex items-center gap-2 shrink-0">
          <button
            class="text-sm px-4 py-1.5 btn font-medium"
            :class="assetsPending
              ? 'bg-amber-300 text-amber-950 hover:bg-amber-200'
              : 'bg-cyan-400 text-cyan-950 hover:bg-cyan-300'"
            :disabled="!store.structure.tree"
            :title="assetsPending
              ? 'Claude is drafting the assets prompt… click to cancel'
              : 'Have Claude draft an asset-generation prompt from the structure, appended below'"
            @click="assetsPending ? store.cancelAgentRequest('suggest-assets') : store.requestAgent('suggest-assets')"
          >{{ assetsPending ? '⏳ 生成中… ✕' : '✨ 生成 assets prompt' }}</button>
          <span class="text-xs text-zinc-500">由 agent 依結構推敲，附加在最下方</span>
        </div>
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
