import type { APIRoute } from 'astro';
import { mutate, getState } from '../../lib/serverState';
import { saveImage, pruneImages } from '../../lib/imageStore';

export const prerender = false;

/** Browser uploads a design image. The bytes are written to disk; only a
 * reference (url + filename) is stored in the workspace state. */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json() as {
      base64: string;      // raw base64 (no data: prefix)
      mediaType: string;
      width: number;
      height: number;
    };

    const stored = saveImage(body.base64, body.mediaType);

    mutate(s => {
      s.sourceImage = {
        url: stored.url,
        filename: stored.filename,
        mediaType: stored.mediaType,
        width: body.width,
        height: body.height,
      };
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
