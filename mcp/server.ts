#!/usr/bin/env tsx
/**
 * bump-square MCP bridge (stdio).
 *
 * Spawned by Claude Code via .mcp.json. Holds no state itself — every tool call
 * is forwarded over HTTP to the running bump-square web server (pnpm dev), which
 * is the single source of truth shared with the browser. This keeps the design
 * tool independently runnable while letting "this session" plug in as the agent.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = process.env.BUMP_SQUARE_URL ?? 'http://localhost:4321';

async function call(tool: string, args: Record<string, unknown> = {}): Promise<any> {
  try {
    const res = await fetch(`${BASE_URL}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, args }),
    });
    return await res.json();
  } catch {
    return { ok: false, error: `Cannot reach bump-square server at ${BASE_URL}. Is it running? (pnpm dev)` };
  }
}

const text = (data: unknown) => ({ content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });

const server = new McpServer({ name: 'bump-square', version: '1.0.0' });

server.registerTool('get_board_state', {
  title: 'Get board state',
  description: 'Read the current workspace: assets, frames (squares), comments, geometric containment hierarchy, generated structure, and any pending `agentRequests` (UI → agent signals the user has fired). Call this first to understand what the user has arranged.',
  inputSchema: {},
}, async () => text(await call('get_state')));

server.registerTool('get_source_image', {
  title: 'Get source image',
  description: 'Returns the uploaded design image so you can visually segment it into UI elements (icons, text, lines, components).',
  inputSchema: {},
}, async () => {
  const res = await call('get_source_image');
  if (!res.ok) return text(res.error ?? 'No image');
  const base64 = res.base64 ?? ''; // /api/mcp returns raw base64 (no data: prefix)
  return {
    content: [
      { type: 'text' as const, text: `Source image ${res.width}×${res.height}px (${res.mediaType}).` },
      { type: 'image' as const, data: base64, mimeType: res.mediaType },
    ],
  };
});

server.registerTool('set_assets', {
  title: 'Set assets',
  description: 'Populate the asset panel after segmenting the source image. Provide the bounding boxes you identified.',
  inputSchema: {
    assets: z.array(z.object({
      type: z.enum(['icon', 'text', 'line', 'shape', 'image', 'component']),
      label: z.string(),
      x: z.number(), y: z.number(), width: z.number(), height: z.number(),
      comment: z.string().optional(),
    })),
  },
}, async ({ assets }) => text(await call('set_assets', { assets })));

server.registerTool('add_frame', {
  title: 'Add frame',
  description: 'Draw a new rectangular frame (square) on the canvas to suggest a layout grouping.',
  inputSchema: {
    x: z.number(), y: z.number(), width: z.number(), height: z.number(),
    label: z.string().optional(),
  },
}, async (args) => text(await call('add_square', args)));

server.registerTool('update_frame', {
  title: 'Update frame',
  description: 'Modify an existing frame (position, size, label, comment, or aiNote) by id. Use `aiNote` to record YOUR inferred role for the frame — it renders read-only and visually distinct from the user\'s own `comment`, so the two act as a double-confirmation. Do not write to `comment` on the user\'s behalf.',
  inputSchema: {
    id: z.string(),
    patch: z.object({
      x: z.number().optional(), y: z.number().optional(),
      width: z.number().optional(), height: z.number().optional(),
      label: z.string().optional(), comment: z.string().optional(),
      aiNote: z.string().optional(),
    }),
  },
}, async (args) => text(await call('update_square', args)));

server.registerTool('set_structure', {
  title: 'Set structure',
  description: 'Push the generated component tree and developer prompt back to the UI so the user sees the result on screen.',
  inputSchema: {
    tree: z.any(),
    prompt: z.string(),
  },
}, async (args) => text(await call('set_structure', args)));

server.registerTool('set_assets_prompt', {
  title: 'Set assets prompt',
  description: 'Push an asset-generation prompt (drafted from the confirmed structure) back to the UI. It is appended below the structure prompt in the Structure → Prompt tab. Call this in response to a `suggest-assets` request: describe, per node, the visual asset to generate (icon / image / illustration), inferred from each frame\'s role + comment.',
  inputSchema: {
    prompt: z.string(),
  },
}, async (args) => text(await call('set_assets_prompt', args)));

server.registerTool('resolve_request', {
  title: 'Resolve agent request',
  description: 'Mark a UI → agent request handled and remove it from the queue. Pass its id, or omit to clear all pending requests. Call this after you have acted on a request from `agentRequests`.',
  inputSchema: {
    id: z.string().optional(),
  },
}, async (args) => text(await call('resolve_request', args)));

server.registerTool('notify_ui', {
  title: 'Notify UI',
  description: 'Post a short status note that appears in the browser Agent panel (e.g. "Segmented 12 elements", "Grouped header into one frame").',
  inputSchema: { message: z.string() },
}, async (args) => text(await call('notify_ui', args)));

await server.connect(new StdioServerTransport());
