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

  const mediaType = getState().sourceImage?.mediaType ?? 'application/octet-stream';

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': mediaType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
