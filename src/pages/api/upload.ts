import type { APIRoute } from 'astro';
import { mutate } from '../../lib/serverState';
import { saveImage, pruneImages } from '../../lib/imageStore';
import { crossOriginBlocked } from '../../lib/guard';

export const prerender = false;

// Raster types only — SVG is excluded as it can carry script (stored XSS) when
// served back with an image/svg+xml Content-Type.
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/** Browser uploads a design image. The bytes are written to disk; only a
 * reference (url + filename) is stored in the workspace state. */
export const POST: APIRoute = async ({ request }) => {
  try {
    if (crossOriginBlocked(request)) return json({ error: 'cross-origin blocked' }, 403);

    const body = await request.json() as {
      base64: string;      // raw base64 (no data: prefix)
      mediaType: string;
      width: number;
      height: number;
    };

    if (!ALLOWED_TYPES.has(body.mediaType)) {
      return json({ error: `Unsupported image type: ${body.mediaType}` }, 415);
    }

    const stored = saveImage(body.base64, body.mediaType);

    mutate(s => {
      s.sourceImage = {
        url: stored.url,
        filename: stored.filename,
        mediaType: stored.mediaType,
        width: body.width,
        height: body.height,
      };
      // Fresh upload = start of a NEW workspace. Clear any "linked save"
      // marker so the next Save creates a new entry rather than overwriting
      // whatever was previously loaded.
      s.currentSaveId = null;
    });

    // Drop any previously uploaded images that are no longer referenced.
    pruneImages([stored.filename]);

    return json({ ok: true, url: stored.url });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Upload failed' }, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
