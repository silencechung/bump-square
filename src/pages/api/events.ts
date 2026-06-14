import type { APIRoute } from 'astro';
import { getState, onChange, canUndo, canRedo, getLocale } from '~src/lib/serverState';

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

      // Augment board state with history availability + current locale. Locale
      // is broadcast on the same channel so a setLocale() emits propagate to
      // every connected tab without a separate socket.
      const payload = (s: unknown) => ({
        ...(s as object),
        canUndo: canUndo(),
        canRedo: canRedo(),
        locale: getLocale(),
      });

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
