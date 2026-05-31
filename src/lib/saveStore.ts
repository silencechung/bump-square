import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  existsSync,
  renameSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { v4 as uuid } from 'uuid';
import type { WorkspaceState } from './serverState';

/**
 * Named saves: snapshots of the whole workspace the user can re-open later.
 *
 * Each save is one JSON file under .bump-square/saves/<id>.json holding
 * { id, name, savedAt, state }. The state references the SAME image files in
 * .bump-square/uploads/ (by filename), which are never deleted on load — so a
 * restored save still resolves its source image.
 *
 * This is separate from the single auto-persisted workspace.json (the live
 * board); saves are explicit, named, and many.
 */
const SAVES_DIR = resolve(process.cwd(), '.bump-square', 'saves');

export interface SaveMeta {
  id: string;
  name: string;
  savedAt: number;
}
/** A save stores only the BOARD (not the agentNotes/agentRequests session log). */
type BoardState = Pick<WorkspaceState, 'sourceImage' | 'assets' | 'squares' | 'structure'>;
interface SaveRecord extends SaveMeta {
  state: BoardState;
}

// Save ids are uuids; reject anything else so a crafted id can't escape
// SAVES_DIR via path traversal (loadSave reads / deleteSave unlinks by id).
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fileFor(id: string): string | null {
  if (!ID_RE.test(id)) return null;
  return resolve(SAVES_DIR, `${id}.json`);
}

/** List saves (metadata only), newest first. */
export function listSaves(): SaveMeta[] {
  try {
    if (!existsSync(SAVES_DIR)) return [];
    return readdirSync(SAVES_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const rec = JSON.parse(readFileSync(resolve(SAVES_DIR, f), 'utf8')) as SaveRecord;
          return { id: rec.id, name: rec.name, savedAt: rec.savedAt };
        } catch {
          return null;
        }
      })
      .filter((m): m is SaveMeta => m !== null)
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

/** Snapshot the given state under a name. Atomic write (tmp → rename).
 * Only the board is stored — the agentNotes/agentRequests log is session-scoped. */
export function createSave(name: string, state: WorkspaceState): SaveMeta {
  mkdirSync(SAVES_DIR, { recursive: true });
  const meta: SaveMeta = { id: uuid(), name: name.trim() || 'Untitled', savedAt: Date.now() };
  // Deep clone so later board mutations don't bleed into the saved snapshot.
  const board: BoardState = {
    sourceImage: state.sourceImage,
    assets: state.assets,
    squares: state.squares,
    structure: state.structure,
  };
  const record: SaveRecord = { ...meta, state: structuredClone(board) };
  // meta.id is a fresh uuid so fileFor never rejects it, but narrow the type
  // (fileFor returns string | null for the path-traversal guard) before use.
  const target = fileFor(meta.id);
  if (!target) throw new Error('createSave: generated id failed validation');
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(record), 'utf8');
  renameSync(tmp, target);
  return meta;
}

/** Read back a saved board (sourceImage/assets/squares/structure), or null. */
export function loadSave(id: string): BoardState | null {
  try {
    const f = fileFor(id);
    if (!f || !existsSync(f)) return null;
    const rec = JSON.parse(readFileSync(f, 'utf8')) as SaveRecord;
    return rec.state ?? null;
  } catch {
    return null;
  }
}

/** Remove a save. Silently ignores a missing file. */
export function deleteSave(id: string): void {
  try {
    const f = fileFor(id);
    if (f && existsSync(f)) unlinkSync(f);
  } catch {
    /* ignore */
  }
}
