import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Asset, Square, StructureNode, WorkflowStep } from '../types';
import type { Viewport } from '../lib/viewport';
import { DEFAULT_LOCALE, type Locale } from '../i18n';

interface SourceImage { url: string; filename: string; mediaType: string; width: number; height: number }
interface AgentEvent {
  id: string;
  kind: string;
  startedAt: number;
  completedAt: number | null;
  exitCode: number | null;
  summary: string | null;
}
interface SaveMeta { id: string; name: string; savedAt: number; path: string }

interface StructurePrompt {
  structure: string | null;   // ## 結構 + ## 節點說明 (from generate-spec)
  assets: string | null;      // ## Assets (from generate-spec, same run)
  suggestions: string | null; // ## 建議 (reserved for #11 Suggest)
}
interface Structure {
  tree: StructureNode | null;
  prompt: StructurePrompt;
  /** Server-stamped `boardVersion` covering the whole `generate-spec` run
   * (writes `prompt.structure` + `prompt.assets` together). `null` until first run. */
  promptVersion: number | null;
  /** Server-stamped `boardVersion` for `prompt.suggestions` (future Suggest run). */
  suggestionsVersion: number | null;
}
interface ServerState {
  sourceImage: SourceImage | null;
  assets: Asset[];
  squares: Square[];
  structure: Structure;
  agentEvents: AgentEvent[];
  /** The save the live workspace was loaded from, if any. Powers SavesMenu's
   * "Save (overwrite)" vs "Save As (new)" branch. */
  currentSaveId: string | null;
  /** Monotonic timetick bumped on every board mutation. Mismatch with
   * `structure.*Version` = the agent-authored prompt is out of date. */
  boardVersion: number;
  canUndo?: boolean;
  canRedo?: boolean;
  /** Current UI locale (from ~/.bump-square/config.json's ui.locale). Pushed
   * on the same SSE channel so all tabs sync when the toggle is pressed. */
  locale?: Locale;
}

/**
 * Client mirror of the server-side source of truth. The browser never owns
 * state: it subscribes to /api/events (SSE) for authoritative snapshots and
 * POSTs mutations to /api/state. Claude reads/writes the same workspace.json
 * on disk, and fs.watch broadcasts those changes through the same SSE channel.
 */
export const useWorkspaceStore = defineStore('workspace', () => {
  // --- Server-synced state (read-only mirror) ---
  const sourceImage = ref<SourceImage | null>(null);
  const assets = ref<Asset[]>([]);
  const squares = ref<Square[]>([]);
  const structure = ref<Structure>({
    tree: null,
    prompt: { structure: null, assets: null, suggestions: null },
    promptVersion: null,
    suggestionsVersion: null,
  });
  const agentEvents = ref<AgentEvent[]>([]);
  const currentSaveId = ref<string | null>(null);
  const boardVersion = ref<number>(0);

  // --- Local-only UI state ---
  const step = ref<WorkflowStep>('upload');
  const selectedAssetId = ref<string | null>(null);
  const selectedSquareId = ref<string | null>(null);
  const connected = ref(false);
  // Which claude --print kind is currently in flight (null = idle). Buttons
  // key off matching this so only the one you pressed shows a spinner.
  const runningKind = ref<string | null>(null);
  const terminalRunning = computed(() => runningKind.value !== null);
  // Set when /api/run-claude returns 409 skill-missing — the UI shows an
  // install banner; clearing it (after install) auto-retries the original call.
  const skillMissing = ref<{ kind: string; message: string } | null>(null);
  const saves = ref<SaveMeta[]>([]);
  const canUndo = ref(false);
  const canRedo = ref(false);
  // UI locale mirror. Defaults to DEFAULT_LOCALE before the first SSE arrives
  // (SSR + pre-hydration); the first 'state' event overwrites with server truth.
  const locale = ref<Locale>(DEFAULT_LOCALE);

  // Viewport (zoom/pan) is purely local: the agent reasons in image space and
  // doesn't care how the user has the canvas scrolled, so this stays out of
  // ServerState / the MCP surface.
  const viewport = ref<Viewport>({ scale: 1, tx: 0, ty: 0 });
  const setViewport = (vp: Viewport) => { viewport.value = vp; };

  const selectedAsset = computed(() => assets.value.find(a => a.id === selectedAssetId.value));
  const selectedSquare = computed(() => squares.value.find(s => s.id === selectedSquareId.value));

  // Counts setLocale dispatches that haven't been ACKed by their own SSE yet.
  // Reason: SSE state broadcasts arrive in dispatch order, but if the user
  // clicks the toggle three times fast (繁→EN→繁), the SSE for click #2
  // ('zh-TW') arrives AFTER click #3's optimistic update to 'en' — and would
  // overwrite the user's intended 'en' back to 'zh-TW' for one frame, looking
  // like a flicker that needs another click to "redo". While any dispatch is
  // in flight, ignore server locale to keep the local optimistic value.
  let pendingLocaleDispatches = 0;

  function applyServerState(s: ServerState) {
    sourceImage.value = s.sourceImage;
    assets.value = s.assets;
    squares.value = s.squares;
    structure.value = s.structure;
    agentEvents.value = s.agentEvents;
    currentSaveId.value = s.currentSaveId ?? null;
    boardVersion.value = s.boardVersion ?? 0;
    canUndo.value = s.canUndo ?? false;
    canRedo.value = s.canRedo ?? false;
    if (s.locale && pendingLocaleDispatches === 0) {
      locale.value = s.locale;
    }

    // Auto-advance the workflow as server state fills in.
    if (s.sourceImage && step.value === 'upload') {
      step.value = 'layout';
    }
  }

  // Locale toggle: dispatch to server, which writes config.json + re-broadcasts.
  // Optimistic local update so the UI feels instant (server confirms via SSE).
  function setLocale(next: Locale) {
    if (next === locale.value) {
      return;
    }
    locale.value = next;
    pendingLocaleDispatches++;
    dispatch('setLocale', { locale: next }).finally(() => {
      pendingLocaleDispatches--;
    });
  }
  function toggleLocale() {
    setLocale(locale.value === 'zh-TW' ? 'en' : 'zh-TW');
  }

  // Stale = a prompt exists, but the board has changed since it was authored.
  // The agent-authored prompt is a snapshot; these flags drive the "需要重新
  // 產生" banner in StructureView so users know to re-run before handoff.
  const isPromptStale = computed(() =>
    structure.value.tree !== null
    && structure.value.promptVersion !== null
    && boardVersion.value !== structure.value.promptVersion,
  );
  const isAssetsPromptStale = computed(() =>
    structure.value.prompt.assets !== null
    && structure.value.promptVersion !== null
    && boardVersion.value !== structure.value.promptVersion,
  );

  let es: EventSource | null = null;
  function connect() {
    if (es) {
      return;
    }
    es = new EventSource('/api/events');
    es.addEventListener('state', (e) => applyServerState(JSON.parse((e as MessageEvent).data)));
    es.onopen = () => { connected.value = true; };
    es.onerror = () => { connected.value = false; };
    refreshSaves();
  }

  async function dispatch(action: string, payload: Record<string, unknown> = {}) {
    const res = await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
    });
    return res.json();
  }

  // --- Image upload (multipart-ish: posts base64 to /api/upload) ---
  async function uploadImage(base64: string, mediaType: string, width: number, height: number) {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64, mediaType, width, height }),
    });
    return res.json();
  }

  // --- Mutations (fire to server; SSE brings the result back) ---
  const addSquare = (x: number, y: number, width: number, height: number) => dispatch('addSquare', { x, y, width, height });
  const updateSquare = (id: string, patch: Partial<Square>) => dispatch('updateSquare', { id, patch });
  const removeSquare = (id: string) => dispatch('removeSquare', { id });
  // Duplicate a frame + its contained frames; select the new copy afterwards.
  async function duplicateFrame(id: string) {
    const r = await dispatch('duplicateFrame', { id });
    if (r?.id) {
      selectedSquareId.value = r.id;
    }
    return r?.id;
  }
  // Move a frame + its contained frames by (dx, dy) image units (commit once).
  const moveFrameGroup = (id: string, dx: number, dy: number) => dispatch('moveFrameGroup', { id, dx, dy });
  // Paste a frame group so the source top-left lands at (x, y); cut removes original.
  async function pasteFrame(sourceId: string, x: number, y: number, cut: boolean) {
    const r = await dispatch('pasteFrame', { sourceId, x, y, cut });
    if (r?.id) {
      selectedSquareId.value = r.id;
    }
    return r?.id;
  }
  const undo = () => dispatch('undo');
  const redo = () => dispatch('redo');
  const placeAssetInSquare = (assetId: string, squareId: string) => dispatch('placeAssetInSquare', { assetId, squareId });
  const updateAsset = (id: string, patch: Partial<Asset>) => dispatch('updateAsset', { id, patch });
  const removeAsset = (id: string) => dispatch('removeAsset', { id });
  const reset = () => dispatch('reset');
  const clearAgentEvents = () => dispatch('clearAgentEvents');

  // --- Named saves ---
  async function refreshSaves() {
    const r = await dispatch('listSaves');
    if (r?.saves) {
      saves.value = r.saves;
    }
  }
  async function saveCurrent(name: string) {
    await dispatch('saveState', { name });
    await refreshSaves();
  }
  // Save-in-place: overwrites whichever save the board was loaded from.
  // Caller is expected to gate on currentSaveId being non-null (the button
  // only shows up in that state). Refreshes the list so timestamps update.
  async function updateCurrentSave() {
    await dispatch('updateCurrentSave');
    await refreshSaves();
  }
  // Currently-loaded save's metadata (for the "ListWidge" header label).
  const currentSave = computed(() =>
    saves.value.find(s => s.id === currentSaveId.value) ?? null,
  );
  // Load replaces the live board; the new state arrives back via SSE.
  const loadSave = (id: string) => dispatch('loadState', { id });
  async function removeSave(id: string) {
    const r = await dispatch('deleteSave', { id });
    if (r?.saves) {
      saves.value = r.saves;
    }
  }

  // Spawn claude --print for a given kind. Streams to /api/terminal/events.
  // On 409 skill-missing, sets skillMissing — UI shows an install banner.
  // The authoritative runningKind comes from the server via SSE; we set it
  // optimistically here so the button spinner shows up before the SSE round-
  // trip arrives, but the server overrides shortly after.
  async function runClaude(kind: string, extraPayload?: Record<string, unknown>) {
    runningKind.value = kind;
    try {
      const res = await fetch('/api/run-claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, ...extraPayload }),
      });
      if (res.status === 409) {
        const body = await res.json();
        if (body.error === 'skill-missing') {
          skillMissing.value = { kind, message: body.message ?? 'skill 未安裝' };
          runningKind.value = null;
        }
      }
    } catch { /* claudeRunner error will show in terminal */ }
  }

  // Install the bump-layout skill, then retry the deferred runClaude call.
  async function installSkillAndRetry() {
    const pending = skillMissing.value;
    if (!pending) {
      return;
    }
    const res = await fetch('/api/install-skill', { method: 'POST' });
    if (!res.ok) {
      return;
    }
    skillMissing.value = null;
    await runClaude(pending.kind);
  }

  const dismissSkillMissing = () => { skillMissing.value = null; };

  // Update running kind from server (TerminalPanel SSE status events). This
  // is the authoritative source — runClaude() sets it optimistically, but the
  // server's value wins (and clears it when claude --print exits).
  const setRunningKind = (k: string | null) => { runningKind.value = k; };

  return {
    sourceImage, assets, squares, structure, agentEvents, boardVersion,
    step, selectedAssetId, selectedSquareId, connected, runningKind, terminalRunning, skillMissing, saves, currentSaveId, canUndo, canRedo,
    locale, setLocale, toggleLocale,
    viewport, setViewport,
    selectedAsset, selectedSquare, currentSave, isPromptStale, isAssetsPromptStale,
    connect,
    uploadImage, addSquare, updateSquare, removeSquare, duplicateFrame,
    moveFrameGroup, pasteFrame, undo, redo,
    placeAssetInSquare, updateAsset, removeAsset, reset, clearAgentEvents,
    runClaude, setRunningKind, installSkillAndRetry, dismissSkillMissing,
    refreshSaves, saveCurrent, updateCurrentSave, loadSave, removeSave,
  };
});
