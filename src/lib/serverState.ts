import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { v4 as uuid } from 'uuid';
import type { Asset, Square, StructureNode, AgentRequest } from '../types';

/**
 * Single source of truth for the live workspace, held in module scope so it
 * persists across HTTP requests within the same Node process. Both the browser
 * (via /api/state/* + SSE) and Claude (via the MCP bridge → /api/mcp/*) read
 * and mutate THIS object.
 *
 * It is ALSO persisted to disk (.bump-square/workspace.json) so the board
 * survives a full server restart — important because restarting Claude Code
 * kills the dev server, and we don't want to lose hand-drawn frames/comments.
 */
export interface WorkspaceState {
  sourceImage: { url: string; filename: string; mediaType: string; width: number; height: number } | null;
  assets: Asset[];
  squares: Square[];
  structure: { tree: StructureNode | null; prompt: string | null; assetsPrompt: string | null };
  agentNotes: { id: string; text: string; timestamp: number }[];
  agentRequests: AgentRequest[];
}

function emptyState(): WorkspaceState {
  return {
    sourceImage: null,
    assets: [],
    squares: [],
    structure: { tree: null, prompt: null, assetsPrompt: null },
    agentNotes: [],
    agentRequests: [],
  };
}

const SAVE_PATH = resolve(process.cwd(), '.bump-square', 'workspace.json');
const SAVE_DEBOUNCE_MS = 400;

function loadFromDisk(): WorkspaceState | null {
  try {
    if (!existsSync(SAVE_PATH)) return null;
    const raw = readFileSync(SAVE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
    // Merge onto a fresh empty state so missing/new fields stay well-formed.
    return { ...emptyState(), ...parsed };
  } catch (err) {
    console.error('[bump-square] Failed to load workspace.json, starting empty:', err);
    return null;
  }
}

// Survive Astro dev HMR by stashing on globalThis; load from disk on cold start.
/** Board-only slice that undo/redo snapshots (the agentNotes/agentRequests log
 * is intentionally NOT part of history, so undoing an edit doesn't wipe notes). */
type BoardSnapshot = Pick<WorkspaceState, 'sourceImage' | 'assets' | 'squares' | 'structure'>;

const g = globalThis as unknown as {
  __bumpSquareState?: WorkspaceState;
  __bumpSquareBus?: EventEmitter;
  __bumpSquareSaveTimer?: ReturnType<typeof setTimeout>;
  __bumpSquareUndo?: BoardSnapshot[];
  __bumpSquareRedo?: BoardSnapshot[];
};

const state: WorkspaceState = g.__bumpSquareState ?? (g.__bumpSquareState = loadFromDisk() ?? emptyState());
// Backfill fields added after this state object was first created. Across HMR
// the object persists on globalThis, so a newly-added field (e.g. agentRequests)
// would otherwise be undefined on an already-running server.
if (!state.agentRequests) state.agentRequests = [];

const bus: EventEmitter = g.__bumpSquareBus ?? (g.__bumpSquareBus = new EventEmitter());
bus.setMaxListeners(50);

// Undo / redo history (board snapshots). HMR-safe via globalThis.
const undoStack: BoardSnapshot[] = g.__bumpSquareUndo ?? (g.__bumpSquareUndo = []);
const redoStack: BoardSnapshot[] = g.__bumpSquareRedo ?? (g.__bumpSquareRedo = []);
const HISTORY_LIMIT = 30;

function snapshotBoard(s: WorkspaceState): BoardSnapshot {
  return structuredClone({
    sourceImage: s.sourceImage,
    assets: s.assets,
    squares: s.squares,
    structure: s.structure,
  });
}

/** Debounced atomic write: serialize to a temp file then rename, so a crash
 * mid-write can never leave a half-written workspace.json. */
function scheduleSave() {
  if (g.__bumpSquareSaveTimer) clearTimeout(g.__bumpSquareSaveTimer);
  g.__bumpSquareSaveTimer = setTimeout(() => {
    try {
      mkdirSync(dirname(SAVE_PATH), { recursive: true });
      const tmp = `${SAVE_PATH}.tmp`;
      writeFileSync(tmp, JSON.stringify(state), 'utf8');
      renameSync(tmp, SAVE_PATH);
    } catch (err) {
      console.error('[bump-square] Failed to save workspace.json:', err);
    }
  }, SAVE_DEBOUNCE_MS);
}

export function getState(): WorkspaceState {
  return state;
}

/** Apply a mutation, broadcast to SSE subscribers, then persist to disk.
 *
 * By default a pre-change board snapshot is pushed to the undo stack. Pass
 * `{ history: false }` for changes that should NOT be undoable steps (agent
 * notes/requests log, and the undo/redo restores themselves). */
export function mutate(
  fn: (s: WorkspaceState) => void,
  opts: { history?: boolean } = {},
): WorkspaceState {
  if (opts.history !== false) {
    undoStack.push(snapshotBoard(state));
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
  }
  fn(state);
  bus.emit('change', state);
  scheduleSave();
  return state;
}

export function canUndo(): boolean { return undoStack.length > 0; }
export function canRedo(): boolean { return redoStack.length > 0; }

/** Restore the previous board snapshot. Returns false if nothing to undo. */
export function undo(): boolean {
  const prev = undoStack.pop();
  if (!prev) return false;
  redoStack.push(snapshotBoard(state));
  mutate(s => Object.assign(s, prev), { history: false });
  return true;
}

/** Re-apply the last undone board snapshot. Returns false if nothing to redo. */
export function redo(): boolean {
  const next = redoStack.pop();
  if (!next) return false;
  undoStack.push(snapshotBoard(state));
  mutate(s => Object.assign(s, next), { history: false });
  return true;
}

export function onChange(listener: (s: WorkspaceState) => void): () => void {
  bus.on('change', listener);
  return () => bus.off('change', listener);
}

export function addAgentNote(text: string) {
  mutate(s => {
    s.agentNotes.push({ id: uuid(), text, timestamp: Date.now() });
    if (s.agentNotes.length > 50) s.agentNotes.shift();
  }, { history: false });
}

/** Clear the agent message log (UI-side housekeeping; doesn't touch board state). */
export function clearAgentNotes() {
  mutate(s => { s.agentNotes = []; }, { history: false });
}

/**
 * Real-time "doorbell": POST the request into the fakechat channel's inbound
 * endpoint so it surfaces in the live Claude Code session as a
 * <channel source="fakechat"> event the instant the user clicks — no polling,
 * no dev-flag self-channel. fakechat is on the official allowlist, so the
 * session launches with the CLEAN flag:
 *   claude --channels plugin:fakechat@claude-plugins-official
 *
 * The text is the agent-facing protocol: it leads with a [bump-square] marker
 * plus kind + request_id so Claude recognises it (the channel tag's own
 * `source` is "fakechat", not "bump-square") and can resolve_request afterwards.
 *
 * Fire-and-forget: fakechat may not be running (session launched without the
 * channel). The doorbell must NEVER break the actual enqueue, so every error is
 * swallowed. The board still works; it just isn't push-woken.
 */
const FAKECHAT_URL = process.env.FAKECHAT_URL ?? 'http://localhost:8787';

function ringFakechat(req: AgentRequest) {
  const text =
    `[bump-square] kind=${req.kind} request_id=${req.id}` +
    (req.note ? `\n\n${req.note}` : '\n\n(no inline payload — read the canvas with get_board_state)');
  try {
    const form = new FormData();
    form.set('id', `bsq-${req.id}`);
    form.set('text', text);
    fetch(`${FAKECHAT_URL}/upload`, { method: 'POST', body: form }).catch(() => {});
  } catch {
    /* FormData/fetch unavailable or threw synchronously — ignore */
  }
}

/** UI → agent: queue a request for Claude to act on the board. Also drops an
 * INSTANT server-side acknowledgement note, so the page reflects "received"
 * the moment the user clicks — independent of when the (latency-bound) main
 * agent actually wakes up to handle it. */
export function addAgentRequest(kind: string, note?: string): AgentRequest {
  const req: AgentRequest = { id: uuid(), kind, note, status: 'pending', createdAt: Date.now() };
  mutate(s => {
    s.agentRequests.push(req);
    if (s.agentRequests.length > 30) s.agentRequests.shift();
    s.agentNotes.push({
      id: uuid(),
      text: `📥 收到請求（${kind}）— Claude 處理中，通常數秒內；若沒反應可在對話中戳一下。`,
      timestamp: Date.now(),
    });
    if (s.agentNotes.length > 50) s.agentNotes.shift();
  }, { history: false });
  ringFakechat(req);
  return req;
}

/** Agent → done: drop a handled request (by id), or all pending if no id. */
export function resolveAgentRequest(id?: string) {
  mutate(s => {
    s.agentRequests = id
      ? s.agentRequests.filter(r => r.id !== id)
      : s.agentRequests.filter(r => r.status !== 'pending');
  }, { history: false });
}

/** Every frame geometrically contained fully within `src` (its whole nested
 * structure). Used so a frame's contents travel with it on move/duplicate/paste. */
function framesInside(src: Square): Square[] {
  return state.squares.filter(
    b =>
      b.id !== src.id &&
      b.x >= src.x &&
      b.y >= src.y &&
      b.x + b.width <= src.x + src.width &&
      b.y + b.height <= src.y + src.height,
  );
}

/** Duplicate a frame AND its contained frames, offset just below the original.
 * Returns the new id of the duplicated source frame. */
export function duplicateFrame(id: string): string | null {
  const src = state.squares.find(s => s.id === id);
  if (!src) return null;
  const group = [src, ...framesInside(src)];
  const dy = src.height + 12; // place the copy directly below the original
  let newSrcId = '';
  mutate(s => {
    const copies = group.map(sq => {
      const nid = uuid();
      if (sq.id === src.id) newSrcId = nid;
      return {
        ...sq,
        id: nid,
        y: sq.y + dy,
        assets: [...sq.assets],
        label: sq.id === src.id ? `${sq.label} copy` : sq.label,
      };
    });
    s.squares.push(...copies);
  });
  return newSrcId;
}

/** Move a frame and its contained frames by (dx, dy) in image units (one step). */
export function moveFrameGroup(id: string, dx: number, dy: number): boolean {
  const src = state.squares.find(s => s.id === id);
  if (!src) return false;
  const ids = new Set<string>([src.id, ...framesInside(src).map(s => s.id)]);
  mutate(s => {
    for (const sq of s.squares) {
      if (ids.has(sq.id)) { sq.x += dx; sq.y += dy; }
    }
  });
  return true;
}

/** Paste a copy of a frame (+contents) so the source's top-left lands at
 * (tx, ty) in image units. If `cut`, the original group is removed. Returns the
 * new source-copy id, or null if the source is gone. */
export function pasteFrame(sourceId: string, tx: number, ty: number, cut: boolean): string | null {
  const src = state.squares.find(s => s.id === sourceId);
  if (!src) return null;
  const group = [src, ...framesInside(src)];
  const dx = tx - src.x;
  const dy = ty - src.y;
  let newSrcId = '';
  mutate(s => {
    const copies = group.map(sq => {
      const nid = uuid();
      if (sq.id === src.id) newSrcId = nid;
      return { ...sq, id: nid, x: sq.x + dx, y: sq.y + dy, assets: [...sq.assets] };
    });
    if (cut) {
      const rm = new Set(group.map(gp => gp.id));
      s.squares = s.squares.filter(q => !rm.has(q.id));
    }
    s.squares.push(...copies);
  });
  return newSrcId;
}

export function resetState() {
  mutate(s => Object.assign(s, emptyState()));
}

/** Replace the live BOARD with a loaded snapshot (named save). The
 * agentNotes/agentRequests session log is deliberately left untouched — saves
 * don't carry it, and loading one shouldn't wipe the current log. */
export function replaceState(snapshot: Partial<WorkspaceState>) {
  const empty = emptyState();
  mutate(s => {
    s.sourceImage = snapshot.sourceImage ?? empty.sourceImage;
    s.assets = snapshot.assets ?? empty.assets;
    s.squares = snapshot.squares ?? empty.squares;
    s.structure = snapshot.structure ?? empty.structure;
  });
}
