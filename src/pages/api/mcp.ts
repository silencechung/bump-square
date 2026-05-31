import type { APIRoute } from 'astro';
import { v4 as uuid } from 'uuid';
import { getState, mutate, addAgentNote, resolveAgentRequest } from '../../lib/serverState';
import { readImageBase64 } from '../../lib/imageStore';
import { computeContainment } from '../../lib/containment';
import type { Asset, Square, StructureNode } from '../../types';

export const prerender = false;

/** Claude (via the stdio MCP bridge) → server. Mirrors the tool surface the
 * agent uses to read and manipulate the live board. */
export const POST: APIRoute = async ({ request }) => {
  try {
    const { tool, args } = await request.json() as { tool: string; args: Record<string, unknown> };
    const s = getState();

    switch (tool) {
      case 'get_state': {
        // Lightweight view for reasoning: omit the heavy image dataUrl, add hierarchy hints.
        const view = {
          hasSourceImage: !!s.sourceImage,
          imageSize: s.sourceImage ? { width: s.sourceImage.width, height: s.sourceImage.height } : null,
          assets: s.assets.map(({ imageUrl, ...rest }) => rest),
          squares: s.squares,
          containment: computeContainment(s.squares),
          structure: s.structure,
          agentRequests: s.agentRequests,
        };
        return json({ ok: true, state: view });
      }

      case 'get_source_image': {
        if (!s.sourceImage) return json({ ok: false, error: 'No image uploaded yet' });
        const base64 = readImageBase64(s.sourceImage.filename);
        if (!base64) return json({ ok: false, error: 'Image file missing on disk' });
        return json({
          ok: true,
          base64,
          mediaType: s.sourceImage.mediaType,
          width: s.sourceImage.width,
          height: s.sourceImage.height,
        });
      }

      case 'set_assets': {
        const incoming = (args.assets as Partial<Asset>[]).map(a => ({
          id: a.id ?? uuid(),
          type: a.type ?? 'shape',
          label: a.label ?? 'element',
          imageUrl: a.imageUrl ?? '',
          x: a.x ?? 0, y: a.y ?? 0,
          width: a.width ?? 0, height: a.height ?? 0,
          comment: a.comment,
        })) as Asset[];
        mutate(st => { st.assets = incoming; });
        return json({ ok: true, count: incoming.length });
      }

      case 'add_square': {
        const sq: Square = {
          id: uuid(),
          x: args.x as number, y: args.y as number,
          width: args.width as number, height: args.height as number,
          label: (args.label as string) ?? `Frame ${s.squares.length + 1}`,
          assets: [],
        };
        mutate(st => { st.squares.push(sq); });
        return json({ ok: true, id: sq.id });
      }

      case 'update_square': {
        mutate(st => {
          const sq = st.squares.find(x => x.id === args.id);
          if (sq) Object.assign(sq, args.patch);
        });
        return json({ ok: true });
      }

      case 'set_structure': {
        // Normalize: the tree may arrive as a parsed object OR as a JSON string
        // (MCP clients often serialize complex args). Consumers — StructureTree,
        // treeToConsole — read .label/.type/.children off an OBJECT, so a string
        // would render as `undefined — undefined`. Coerce to an object here, the
        // single boundary where the tree enters server state.
        const tree = normalizeTree(args.tree);
        mutate(st => {
          // A freshly generated structure invalidates any previous assets prompt.
          st.structure = { tree, prompt: args.prompt as string, assetsPrompt: null };
        });
        return json({ ok: true });
      }

      case 'set_assets_prompt': {
        // Agent-authored asset-generation prompt, appended below the structure
        // prompt in the UI. Stored separately so regenerating the tree clears it.
        mutate(st => { st.structure.assetsPrompt = (args.prompt as string) ?? null; });
        return json({ ok: true });
      }

      case 'notify_ui': {
        addAgentNote(args.message as string);
        return json({ ok: true });
      }

      case 'resolve_request': {
        resolveAgentRequest(args.id as string | undefined);
        return json({ ok: true });
      }

      default:
        return json({ ok: false, error: `Unknown tool: ${tool}` }, 400);
    }
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Coerce a structure tree into a StructureNode object. Accepts an already-parsed
 * object (returned as-is) or a JSON string (parsed). Anything unusable → null,
 * so the UI falls back to its "No structure yet" empty state instead of crashing. */
function normalizeTree(raw: unknown): StructureNode | null {
  if (raw && typeof raw === 'object') return raw as StructureNode;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as StructureNode) : null;
    } catch {
      return null;
    }
  }
  return null;
}
