import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, basename } from 'node:path';
import { v4 as uuid } from 'uuid';

/**
 * Binary image assets live on disk, NOT in the JSON workspace state. The state
 * only keeps a reference (url + filename). This keeps workspace.json small and
 * avoids re-broadcasting a base64 blob on every SSE update.
 *
 * Files are stored under .bump-square/uploads/ (gitignored, self-contained) and
 * served back to the browser via the /api/image/[name] route.
 */
const UPLOAD_DIR = resolve(homedir(), '.bump-square', 'uploads');

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

export interface StoredImage {
  filename: string;
  url: string;        // browser-facing path
  mediaType: string;
}

/** Persist a base64-encoded image to disk and return its reference. */
export function saveImage(base64Data: string, mediaType: string): StoredImage {
  mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = MIME_EXT[mediaType] ?? 'bin';
  const filename = `${uuid()}.${ext}`;
  writeFileSync(resolve(UPLOAD_DIR, filename), Buffer.from(base64Data, 'base64'));
  return { filename, url: `/api/image/${filename}`, mediaType };
}

/** Read an image back as base64 (used by the MCP get_source_image tool so the
 * agent can actually SEE the design). Returns null if the file is missing. */
export function readImageBase64(filename: string): string | null {
  const safe = basename(filename); // guard against path traversal
  const path = resolve(UPLOAD_DIR, safe);
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path).toString('base64');
}

/** Read raw bytes for serving over HTTP. */
export function readImageBytes(filename: string): Buffer | null {
  const safe = basename(filename);
  const path = resolve(UPLOAD_DIR, safe);
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path);
}

/** Remove every stored image except the ones still referenced. Call after a new
 * upload to avoid accumulating orphaned files. */
export function pruneImages(keepFilenames: string[]) {
  if (!existsSync(UPLOAD_DIR)) {
    return;
  }
  const keep = new Set(keepFilenames);
  for (const f of readdirSync(UPLOAD_DIR)) {
    if (!keep.has(f)) {
      try { unlinkSync(resolve(UPLOAD_DIR, f)); } catch { /* ignore */ }
    }
  }
}

export function extensionFor(mediaType: string): string {
  return MIME_EXT[mediaType] ?? 'bin';
}
