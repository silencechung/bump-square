import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, watch } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { v4 as uuid } from 'uuid';
import type { Asset, Square, StructureNode } from '../types';
import type { Locale } from '../i18n';
import { loadConfig, saveLocale } from './config';

/**
 * Single source of truth for the live workspace, held in module scope so it
 * persists across HTTP requests within the same Node process. The browser
 * mutates via /api/state/* and observes via /api/events (SSE); the agent
 * (`claude --print` spawned by /api/run-claude) reads/writes the persisted
 * file (~/.bump-square/workspace.json) directly, and a fs.watch on that
 * file reloads this in-memory state and broadcasts to SSE listeners.
 *
 * The disk file IS the truth across process restarts.
 */
/** One row in the AGENT panel's history log. Captures every `claude --print`
 * trigger from the UI's AI buttons + its completion state + the agent's final
 * assistant line as a summary. Live xterm streaming still happens in the
 * TerminalPanel; this is the at-a-glance history, not the conversation. */
export interface AgentEvent {
  id: string;
  kind: string;            // 'generate-structure' | 'suggest-assets' | …
  startedAt: number;
  completedAt: number | null;
  exitCode: number | null; // 0 = ok, non-zero / -1 = failed
  summary: string | null;  // last assistant text block, used as the row's blurb
}

export interface WorkspaceState {
  sourceImage: { url: string; filename: string; mediaType: string; width: number; height: number } | null;
  assets: Asset[];
  squares: Square[];
  structure: {
    tree: StructureNode | null;
    prompt: string | null;
    assetsPrompt: string | null;
    /** `boardVersion` captured at the moment generate-structure was spawned.
     * UI compares this against the current `boardVersion` to flag the prompt
     * as out-of-date after any board edit. `null` until the first generation. */
    promptVersion: number | null;
    /** Same idea for the agent-authored assets prompt. */
    assetsPromptVersion: number | null;
  };
  agentEvents: AgentEvent[];
  /** The save the live workspace originated from (if loaded via SavesMenu).
   * Used so the menu can offer "Save" (overwrite this one) vs "Save As"
   * (always new). Cleared on upload-new-image / reset. Workspace metadata,
   * not board content — deliberately NOT snapshotted into BoardSnapshot
   * (a saved snapshot doesn't carry its own id; undo doesn't restore it). */
  currentSaveId: string | null;
  /** Monotonic timetick (`Date.now()`) bumped on every board-affecting
   * mutation (add/update/remove/move/paste/duplicate frame, asset edits,
   * undo/redo, reset, save-load). Compared with `structure.*Version` to tell
   * whether the agent-authored prompt still matches the canvas. */
  boardVersion: number;
}

function emptyState(): WorkspaceState {
  return {
    sourceImage: null,
    assets: [],
    squares: [],
    structure: {
      tree: null, prompt: null, assetsPrompt: null,
      promptVersion: null, assetsPromptVersion: null,
    },
    agentEvents: [],
    currentSaveId: null,
    boardVersion: Date.now(),
  };
}

const SAVE_PATH = resolve(homedir(), '.bump-square', 'workspace.json');

/** Absolute path of workspace.json on disk (for external tools like claude --print). */
export const workspacePath = SAVE_PATH;
const SAVE_DEBOUNCE_MS = 400;

/**
 * One-off normalize for the CommentEditor `\n` round-trip bug (pre-fix):
 * the editor's `getText()` used the Tiptap default `\n\n` separator while
 * `stringToDoc.split('\n')` split on single `\n`, doubling the empty
 * paragraphs in `sq.comment` on every reload — exponentially. Fix is in
 * `CommentEditor.vue` (uses `{ blockSeparator: '\n' }`); this migration
 * collapses already-bloated comments on disk.
 *
 * Trade-off: cap-at-2 would preserve intentional double-Enter empty
 * paragraphs, but the editor never had a UX for them and the old bug
 * also produced exactly `\n\n` from a single Enter — there's no way to
 * tell intent from artifact in `\n\n`. Collapsing all `\n{2,}` to a
 * single `\n` is the user-chosen behavior (M2 in the design thread).
 *
 * Idempotent: re-running on a clean comment is a no-op.
 */
function normalizeCommentNewlines(s: WorkspaceState): WorkspaceState {
  for (const sq of s.squares) {
    if (sq.comment) {
      sq.comment = sq.comment.replace(/\n{2,}/g, '\n');
    }
    if (sq.aiNote) {
      sq.aiNote = sq.aiNote.replace(/\n{2,}/g, '\n');
    }
  }
  return s;
}

function loadFromDisk(): WorkspaceState | null {
  try {
    if (!existsSync(SAVE_PATH)) {
      return null;
    }
    const raw = readFileSync(SAVE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
    // Merge onto a fresh empty state so missing/new fields stay well-formed.
    const merged = { ...emptyState(), ...parsed };
    return normalizeCommentNewlines(merged);
  } catch (err) {
    console.error('[bump-square] Failed to load workspace.json, starting empty:', err);
    return null;
  }
}

// Survive Astro dev HMR by stashing on globalThis; load from disk on cold start.
/** Board-only slice that undo/redo snapshots (the agentEvents log is
 * intentionally NOT part of history, so undoing an edit doesn't wipe notes). */
type BoardSnapshot = Pick<WorkspaceState, 'sourceImage' | 'assets' | 'squares' | 'structure'>;

const g = globalThis as unknown as {
  __bumpSquareState?: WorkspaceState;
  __bumpSquareBus?: EventEmitter;
  __bumpSquareSaveTimer?: ReturnType<typeof setTimeout>;
  __bumpSquareUndo?: BoardSnapshot[];
  __bumpSquareRedo?: BoardSnapshot[];
  __bumpSquareLocale?: Locale;
};

const state: WorkspaceState = g.__bumpSquareState ?? (g.__bumpSquareState = loadFromDisk() ?? emptyState());

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

// Suppress fs.watch callback for writes we initiated (atomic rename triggers it).
let _suppressWatch = false;

/** Debounced atomic write: serialize to a temp file then rename, so a crash
 * mid-write can never leave a half-written workspace.json. */
function scheduleSave() {
  if (g.__bumpSquareSaveTimer) {
    clearTimeout(g.__bumpSquareSaveTimer);
  }
  g.__bumpSquareSaveTimer = setTimeout(() => {
    try {
      mkdirSync(dirname(SAVE_PATH), { recursive: true });
      const tmp = `${SAVE_PATH}.tmp`;
      _suppressWatch = true;
      writeFileSync(tmp, JSON.stringify(state), 'utf8');
      renameSync(tmp, SAVE_PATH);
      setTimeout(() => { _suppressWatch = false; }, 200);
    } catch (err) {
      _suppressWatch = false;
      console.error('[bump-square] Failed to save workspace.json:', err);
    }
  }, SAVE_DEBOUNCE_MS);
}

// Eagerly persist on module load so external tools (claude --print) always
// find a current snapshot at workspacePath, even after a cold HMR restart.
scheduleSave();

// Watch for external writes (e.g. from claude --print). When workspace.json
// changes on disk and we didn't write it, reload and broadcast to SSE clients.
(function setupFileWatch() {
  const dir = dirname(SAVE_PATH);
  try {
    mkdirSync(dir, { recursive: true });
    watch(dir, (_, filename) => {
      if (filename !== 'workspace.json' || _suppressWatch) {
        return;
      }
      try {
        const raw = readFileSync(SAVE_PATH, 'utf8');
        const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
        // Server is the sole arbiter of version stamps. Preserve in-memory
        // values so a race between the agent's file write and the runner's
        // close-handler stamp can never lose them (whichever lands second wins
        // — for these fields, in-memory always wins).
        const inMem = {
          promptVersion: state.structure.promptVersion,
          assetsPromptVersion: state.structure.assetsPromptVersion,
          boardVersion: state.boardVersion,
        };
        Object.assign(state, { ...emptyState(), ...parsed });
        state.structure.promptVersion = inMem.promptVersion;
        state.structure.assetsPromptVersion = inMem.assetsPromptVersion;
        state.boardVersion = inMem.boardVersion;
        bus.emit('change', state);
      } catch { /* mid-write or parse error — skip */ }
    });
  } catch (err) {
    console.error('[bump-square] Could not watch workspace dir:', err);
  }
}());

export function getState(): WorkspaceState {
  return state;
}

/** Apply a mutation, broadcast to SSE subscribers, then persist to disk.
 *
 * - `history` (default true): push a pre-change board snapshot onto the undo
 *   stack. Pass `false` for changes that should NOT be undoable (agent log,
 *   the undo/redo restores themselves, version stamps).
 * - `bumpVersion` (default = `history`): tick `state.boardVersion` to
 *   `Date.now()`. Default tracks `history` so board edits bump and metadata
 *   changes don't. Undo/redo override with `{ history: false, bumpVersion: true }`
 *   because they CHANGE the board even though they're not new steps. */
export function mutate(
  fn: (s: WorkspaceState) => void,
  opts: { history?: boolean; bumpVersion?: boolean } = {},
): WorkspaceState {
  if (opts.history !== false) {
    undoStack.push(snapshotBoard(state));
    if (undoStack.length > HISTORY_LIMIT) {
      undoStack.shift();
    }
    redoStack.length = 0;
  }
  fn(state);
  const shouldBump = opts.bumpVersion ?? (opts.history !== false);
  if (shouldBump) {
    state.boardVersion = Date.now();
  }
  bus.emit('change', state);
  scheduleSave();
  return state;
}

/** Stamp the `structure.<field>Version` to whatever `boardVersion` was when
 * the agent started. Called by `claudeRunner` on successful completion; not a
 * board edit itself (no history, no boardVersion bump). */
export function stampStructureVersion(field: 'prompt' | 'assets', version: number | null) {
  mutate(s => {
    if (field === 'prompt') {
      s.structure.promptVersion = version;
    }
    else {
      s.structure.assetsPromptVersion = version;
    }
  }, { history: false, bumpVersion: false });
}

export function canUndo(): boolean { return undoStack.length > 0; }
export function canRedo(): boolean { return redoStack.length > 0; }

/** Restore the previous board snapshot. Returns false if nothing to undo.
 * Undo is not a history step but it IS a board change, so we bump
 * boardVersion explicitly (default tracks `history`, which would say "no"). */
export function undo(): boolean {
  const prev = undoStack.pop();
  if (!prev) {
    return false;
  }
  redoStack.push(snapshotBoard(state));
  mutate(s => Object.assign(s, prev), { history: false, bumpVersion: true });
  return true;
}

/** Re-apply the last undone board snapshot. Returns false if nothing to redo. */
export function redo(): boolean {
  const next = redoStack.pop();
  if (!next) {
    return false;
  }
  undoStack.push(snapshotBoard(state));
  mutate(s => Object.assign(s, next), { history: false, bumpVersion: true });
  return true;
}

export function onChange(listener: (s: WorkspaceState) => void): () => void {
  bus.on('change', listener);
  return () => bus.off('change', listener);
}

// --- UI locale ---
// Locale is a UI preference, not board state — kept module-scoped (not in
// WorkspaceState / workspace.json) so loading a named save doesn't yank the
// user's language preference around. Persisted in ~/.bump-square/config.json,
// broadcast through the same SSE bus as board changes so all open tabs sync.
let currentLocale: Locale = g.__bumpSquareLocale ?? (g.__bumpSquareLocale = loadConfig().ui.locale);

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(next: Locale): void {
  if (next === currentLocale) {
    return;
  }
  saveLocale(next);
  currentLocale = next;
  g.__bumpSquareLocale = next;
  // Re-emit existing state so SSE subscribers re-read the locale-augmented payload.
  bus.emit('change', state);
}

/** Record the start of a `claude --print` run. Returns the new event id so the
 * caller can call completeAgentEvent on it when the child closes. Caps the
 * log at 50 entries (drops oldest). */
export function addAgentEvent(kind: string): string {
  const id = uuid();
  mutate(s => {
    s.agentEvents.push({
      id, kind,
      startedAt: Date.now(),
      completedAt: null,
      exitCode: null,
      summary: null,
    });
    if (s.agentEvents.length > 50) {
      s.agentEvents.shift();
    }
  }, { history: false });
  return id;
}

/** Mark an in-flight event as done with its exit code + optional summary
 * (typically the agent's last assistant text line). Silently no-ops if the
 * event was already pruned. */
export function completeAgentEvent(id: string, exitCode: number, summary: string | null) {
  mutate(s => {
    const ev = s.agentEvents.find(e => e.id === id);
    if (!ev) {
      return;
    }
    ev.completedAt = Date.now();
    ev.exitCode = exitCode;
    if (summary) {
      ev.summary = summary;
    }
  }, { history: false });
}

/** Clear the agent event log (UI-side housekeeping; doesn't touch board state). */
export function clearAgentEvents() {
  mutate(s => { s.agentEvents = []; }, { history: false });
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
  if (!src) {
    return null;
  }
  const group = [src, ...framesInside(src)];
  const dy = src.height + 12; // place the copy directly below the original
  let newSrcId = '';
  mutate(s => {
    const copies = group.map(sq => {
      const nid = uuid();
      if (sq.id === src.id) {
        newSrcId = nid;
      }
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
  if (!src) {
    return false;
  }
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
  if (!src) {
    return null;
  }
  const group = [src, ...framesInside(src)];
  const dx = tx - src.x;
  const dy = ty - src.y;
  let newSrcId = '';
  mutate(s => {
    const copies = group.map(sq => {
      const nid = uuid();
      if (sq.id === src.id) {
        newSrcId = nid;
      }
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
 * agentEvents session log is deliberately left untouched — saves don't carry
 * it, and loading one shouldn't wipe the current log.
 *
 * Defensive: if the snapshot's sourceImage refers to a file that no longer
 * exists in ~/.bump-square/uploads/ (e.g. an upload was renamed or pruned
 * after the save was taken), clear it instead of carrying forward a broken
 * reference. UI then shows "no image" rather than a 404'd <img>. */
export function replaceState(snapshot: Partial<WorkspaceState>) {
  const empty = emptyState();
  const sourceImage = (() => {
    if (!snapshot.sourceImage) {
      return empty.sourceImage;
    }
    // Tampered save files could carry a crafted filename like `../../etc/passwd`.
    // basename() strips any path components → resolves to .bump-square/uploads/<name>
    // unconditionally. If basename differs from the raw value, the filename was
    // path-shaped: reject outright.
    const raw = snapshot.sourceImage.filename;
    const safe = basename(raw);
    if (safe !== raw) {
      console.warn(`[bump-square] replaceState: rejecting path-shaped sourceImage filename ${JSON.stringify(raw)}`);
      return empty.sourceImage;
    }
    const filePath = resolve(homedir(), '.bump-square', 'uploads', safe);
    if (!existsSync(filePath)) {
      console.warn(
        `[bump-square] replaceState: sourceImage ${safe} is missing on disk, clearing.`,
      );
      return empty.sourceImage;
    }
    return snapshot.sourceImage;
  })();
  mutate(s => {
    s.sourceImage = sourceImage;
    s.assets = snapshot.assets ?? empty.assets;
    s.squares = snapshot.squares ?? empty.squares;
    s.structure = snapshot.structure ?? empty.structure;
    // Loading a save restores the original boardVersion so the snapshot's
    // freshness verdict (structure.promptVersion vs boardVersion) carries
    // over — a fresh save loads as fresh, a stale save loads as stale.
    // Fall back to the prompt's stamp (or now) for legacy saves with no
    // recorded boardVersion.
    s.boardVersion = snapshot.boardVersion
      ?? s.structure.promptVersion
      ?? Date.now();
  }, { history: true, bumpVersion: false });
}
