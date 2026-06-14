import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  existsSync,
  renameSync,
} from 'node:fs';
import { homedir } from 'node:os';
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
const SAVES_DIR = resolve(homedir(), '.bump-square', 'saves');

export interface SaveMeta {
  id: string;
  name: string;
  savedAt: number;
  /** Absolute path on disk — the client copies this for downstream agents
   * (reader skills) to load. Always under SAVES_DIR/<id>.json. */
  path: string;
}
/** A save stores only the BOARD (not the agentEvents session log). */
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
          const full = resolve(SAVES_DIR, f);
          const rec = JSON.parse(readFileSync(full, 'utf8')) as SaveRecord;
          return { id: rec.id, name: rec.name, savedAt: rec.savedAt, path: full };
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
 * Only the board is stored — the agentEvents log is session-scoped. */
export function createSave(name: string, state: WorkspaceState): SaveMeta {
  mkdirSync(SAVES_DIR, { recursive: true });
  const id = uuid();
  const target = fileFor(id);
  if (!target) throw new Error('createSave: generated id failed validation');
  const meta: SaveMeta = { id, name: name.trim() || 'Untitled', savedAt: Date.now(), path: target };
  // Deep clone so later board mutations don't bleed into the saved snapshot.
  const board: BoardState = {
    sourceImage: state.sourceImage,
    assets: state.assets,
    squares: state.squares,
    structure: state.structure,
  };
  const record: SaveRecord = { ...meta, state: structuredClone(board) };
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(record), 'utf8');
  renameSync(tmp, target);
  return meta;
}

/** Overwrite an existing save's board state in place (same id, same file).
 * Optionally rename. Returns the updated metadata, or null if the id doesn't
 * resolve / the file is gone. Atomic write (tmp + rename) matches createSave. */
export function updateSave(id: string, state: WorkspaceState, name?: string): SaveMeta | null {
  const target = fileFor(id);
  if (!target || !existsSync(target)) return null;
  try {
    const existing = JSON.parse(readFileSync(target, 'utf8')) as SaveRecord;
    const meta: SaveMeta = {
      id: existing.id,
      name: (name?.trim() || existing.name) || 'Untitled',
      savedAt: Date.now(),
      path: target,
    };
    const board: BoardState = {
      sourceImage: state.sourceImage,
      assets: state.assets,
      squares: state.squares,
      structure: state.structure,
    };
    const record: SaveRecord = { ...meta, state: structuredClone(board) };
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, JSON.stringify(record), 'utf8');
    renameSync(tmp, target);
    return meta;
  } catch {
    return null;
  }
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
