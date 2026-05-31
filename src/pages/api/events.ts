import type { APIRoute } from 'astro';
import { getState, onChange, canUndo, canRedo } from '../../lib/serverState';

export const prerender = false;

/** Server-Sent Events: pushes the authoritative workspace state to the browser
 * whenever it changes (whether the change came from the browser or from Claude). */
export const GET: APIRoute = async () => {
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Augment the board state with history availability for the UI buttons.
      const payload = (s: unknown) => ({ ...(s as object), canUndo: canUndo(), canRedo: canRedo() });

      // Initial snapshot
      send('state', payload(getState()));

      unsubscribe = onChange(s => send('state', payload(s)));

      // Keep connection alive through proxies
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(': ping\n\n')), 15000);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
};
