import type { APIRoute } from 'astro';
import { readImageBytes } from '../../../lib/imageStore';
import { getState } from '../../../lib/serverState';

export const prerender = false;

/** Serves uploaded design images from .bump-square/uploads/. */
export const GET: APIRoute = ({ params }) => {
  const name = params.name;
  if (!name) return new Response('Not found', { status: 404 });

  const bytes = readImageBytes(name);
  if (!bytes) return new Response('Not found', { status: 404 });

  // Serve only known raster types; never echo an attacker-influenced type that
  // could make the browser render HTML/SVG. nosniff blocks MIME-sniffing too.
  const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
  const stored = getState().sourceImage?.mediaType;
  const mediaType = stored && ALLOWED.has(stored) ? stored : 'application/octet-stream';

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': mediaType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
