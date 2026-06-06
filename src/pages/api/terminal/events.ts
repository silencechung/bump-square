import type { APIRoute } from 'astro';
import { getTerminalBuffer, subscribeTerminal, subscribeTerminalClear, subscribeRunning, isRunning } from '../../../lib/claudeRunner';

export const prerender = false;

/** SSE stream: replays buffer history on connect, then live-pushes new chunks.
 * Chunks are base64-encoded to avoid SSE line-break issues. */
export const GET: APIRoute = async () => {
  const encoder = new TextEncoder();

  let unsubChunk: (() => void) | null = null;
  let unsubClear: (() => void) | null = null;
  let unsubRunning: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const sendChunk = (chunk: string) => {
        const b64 = btoa(unescape(encodeURIComponent(chunk)));
        controller.enqueue(encoder.encode(`event: chunk\ndata: ${b64}\n\n`));
      };
      const sendClear = () => {
        controller.enqueue(encoder.encode(`event: clear\ndata: 1\n\n`));
      };
      const sendStatus = (running: boolean) => {
        controller.enqueue(encoder.encode(`event: status\ndata: ${JSON.stringify({ running })}\n\n`));
      };

      // Force-flush HTTP headers immediately (node adapter buffers until first write)
      controller.enqueue(encoder.encode(': connected\n\n'));
      sendStatus(isRunning());

      // Replay history
      const history = getTerminalBuffer().join('\n');
      if (history) sendChunk(history);

      unsubChunk = subscribeTerminal(sendChunk);
      unsubClear = subscribeTerminalClear(sendClear);
      unsubRunning = subscribeRunning(sendStatus);
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(': ping\n\n')), 15000);
    },
    cancel() {
      unsubChunk?.();
      unsubClear?.();
      unsubRunning?.();
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
