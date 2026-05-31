import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Asset, Square, StructureNode, WorkflowStep, AgentRequest } from '../types';
import type { Viewport } from '../lib/viewport';

interface SourceImage { url: string; filename: string; mediaType: string; width: number; height: number }
interface AgentNote { id: string; text: string; timestamp: number }
interface SaveMeta { id: string; name: string; savedAt: number }

interface ServerState {
  sourceImage: SourceImage | null;
  assets: Asset[];
  squares: Square[];
  structure: { tree: StructureNode | null; prompt: string | null; assetsPrompt: string | null };
  agentNotes: AgentNote[];
  agentRequests: AgentRequest[];
  canUndo?: boolean;
  canRedo?: boolean;
}

/**
 * Client mirror of the server-side source of truth. The browser never owns
 * state: it subscribes to /api/events (SSE) for authoritative snapshots and
 * POSTs mutations to /api/state. Claude mutates the SAME server state via the
 * MCP bridge, so its changes arrive here through the very same SSE channel.
 */
export const useWorkspaceStore = defineStore('workspace', () => {
  // --- Server-synced state (read-only mirror) ---
  const sourceImage = ref<SourceImage | null>(null);
  const assets = ref<Asset[]>([]);
  const squares = ref<Square[]>([]);
  const structure = ref<{ tree: StructureNode | null; prompt: string | null; assetsPrompt: string | null }>({ tree: null, prompt: null, assetsPrompt: null });
  const agentNotes = ref<AgentNote[]>([]);
  const agentRequests = ref<AgentRequest[]>([]);

  // --- Local-only UI state ---
  const step = ref<WorkflowStep>('upload');
  const selectedAssetId = ref<string | null>(null);
  const selectedSquareId = ref<string | null>(null);
  const connected = ref(false);
  const saves = ref<SaveMeta[]>([]);
  const canUndo = ref(false);
  const canRedo = ref(false);

  // Viewport (zoom/pan) is purely local: the agent reasons in image space and
  // doesn't care how the user has the canvas scrolled, so this stays out of
  // ServerState / the MCP surface.
  const viewport = ref<Viewport>({ scale: 1, tx: 0, ty: 0 });
  const setViewport = (vp: Viewport) => { viewport.value = vp; };

  const selectedAsset = computed(() => assets.value.find(a => a.id === selectedAssetId.value));
  const selectedSquare = computed(() => squares.value.find(s => s.id === selectedSquareId.value));

  function applyServerState(s: ServerState) {
    sourceImage.value = s.sourceImage;
    assets.value = s.assets;
    squares.value = s.squares;
    structure.value = s.structure;
    agentNotes.value = s.agentNotes;
    agentRequests.value = s.agentRequests ?? [];
    canUndo.value = s.canUndo ?? false;
    canRedo.value = s.canRedo ?? false;

    // Auto-advance the workflow as server state fills in.
    if (s.sourceImage && step.value === 'upload') step.value = 'layout';
  }

  let es: EventSource | null = null;
  function connect() {
    if (es) return;
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
    if (r?.id) selectedSquareId.value = r.id;
    return r?.id;
  }
  // Move a frame + its contained frames by (dx, dy) image units (commit once).
  const moveFrameGroup = (id: string, dx: number, dy: number) => dispatch('moveFrameGroup', { id, dx, dy });
  // Paste a frame group so the source top-left lands at (x, y); cut removes original.
  async function pasteFrame(sourceId: string, x: number, y: number, cut: boolean) {
    const r = await dispatch('pasteFrame', { sourceId, x, y, cut });
    if (r?.id) selectedSquareId.value = r.id;
    return r?.id;
  }
  const undo = () => dispatch('undo');
  const redo = () => dispatch('redo');
  const placeAssetInSquare = (assetId: string, squareId: string) => dispatch('placeAssetInSquare', { assetId, squareId });
  const updateAsset = (id: string, patch: Partial<Asset>) => dispatch('updateAsset', { id, patch });
  const removeAsset = (id: string) => dispatch('removeAsset', { id });
  const reset = () => dispatch('reset');
  const clearAgentNotes = () => dispatch('clearAgentNotes');

  // --- Named saves ---
  async function refreshSaves() {
    const r = await dispatch('listSaves');
    if (r?.saves) saves.value = r.saves;
  }
  async function saveCurrent(name: string) {
    await dispatch('saveState', { name });
    await refreshSaves();
  }
  // Load replaces the live board; the new state arrives back via SSE.
  const loadSave = (id: string) => dispatch('loadState', { id });
  async function removeSave(id: string) {
    const r = await dispatch('deleteSave', { id });
    if (r?.saves) saves.value = r.saves;
  }

  // UI → agent: ask Claude to act on the board. Result returns via SSE (the
  // agent picks it up, acts, then resolves it).
  const requestAgent = (kind = 'review', note?: string) => dispatch('requestAgent', { kind, note });
  // Pending state is per-KIND: a pending generate-structure must not light up the
  // handoff button (and vice-versa) — they're independent actions.
  const isRequestPending = (kind: string) => agentRequests.value.some(r => r.status === 'pending' && r.kind === kind);
  const cancelAgentRequest = (kind?: string) => {
    if (!kind) return dispatch('cancelAgentRequest');
    const req = agentRequests.value.find(r => r.status === 'pending' && r.kind === kind);
    if (req) return dispatch('cancelAgentRequest', { id: req.id });
  };

  return {
    sourceImage, assets, squares, structure, agentNotes, agentRequests,
    step, selectedAssetId, selectedSquareId, connected, saves, canUndo, canRedo,
    viewport, setViewport,
    selectedAsset, selectedSquare, isRequestPending,
    connect,
    uploadImage, addSquare, updateSquare, removeSquare, duplicateFrame,
    moveFrameGroup, pasteFrame, undo, redo,
    placeAssetInSquare, updateAsset, removeAsset, reset, clearAgentNotes, requestAgent, cancelAgentRequest,
    refreshSaves, saveCurrent, loadSave, removeSave,
  };
});
