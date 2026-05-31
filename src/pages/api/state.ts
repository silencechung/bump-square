import type { APIRoute } from 'astro';
import { v4 as uuid } from 'uuid';
import { getState, mutate, resetState, replaceState, duplicateFrame, moveFrameGroup, pasteFrame, undo, redo, addAgentRequest, resolveAgentRequest, clearAgentNotes } from '../../lib/serverState';
import { listSaves, createSave, loadSave, deleteSave } from '../../lib/saveStore';
import { crossOriginBlocked } from '../../lib/guard';
import type { Square } from '../../types';

export const prerender = false;

/** Browser → server mutations. Each action mutates the shared state, which is
 * then broadcast to all SSE subscribers (browser tabs AND reflected to Claude). */
export const POST: APIRoute = async ({ request }) => {
  try {
    if (crossOriginBlocked(request)) return json({ error: 'cross-origin blocked' }, 403);

    const { action, payload } = await request.json() as { action: string; payload: Record<string, unknown> };

    switch (action) {
      case 'addSquare': {
        const sq: Square = {
          id: uuid(),
          x: payload.x as number,
          y: payload.y as number,
          width: payload.width as number,
          height: payload.height as number,
          label: (payload.label as string) ?? `Frame ${getState().squares.length + 1}`,
          assets: [],
        };
        mutate(s => { s.squares.push(sq); });
        return json({ ok: true, id: sq.id });
      }

      case 'updateSquare':
        mutate(s => {
          const sq = s.squares.find(x => x.id === payload.id);
          if (sq) Object.assign(sq, payload.patch);
        });
        break;

      case 'removeSquare':
        mutate(s => { s.squares = s.squares.filter(x => x.id !== payload.id); });
        break;

      case 'duplicateFrame': {
        const newId = duplicateFrame(payload.id as string);
        if (!newId) return json({ error: 'Frame not found' }, 404);
        return json({ ok: true, id: newId });
      }

      case 'moveFrameGroup':
        moveFrameGroup(payload.id as string, payload.dx as number, payload.dy as number);
        break;

      case 'pasteFrame': {
        const newId = pasteFrame(
          payload.sourceId as string,
          payload.x as number,
          payload.y as number,
          !!payload.cut,
        );
        if (!newId) return json({ error: 'Source frame not found' }, 404);
        return json({ ok: true, id: newId });
      }

      case 'undo':
        return json({ ok: true, changed: undo() });

      case 'redo':
        return json({ ok: true, changed: redo() });

      case 'placeAssetInSquare':
        mutate(s => {
          for (const sq of s.squares) sq.assets = sq.assets.filter(a => a !== payload.assetId);
          const target = s.squares.find(x => x.id === payload.squareId);
          if (target && !target.assets.includes(payload.assetId as string)) {
            target.assets.push(payload.assetId as string);
          }
        });
        break;

      case 'updateAsset':
        mutate(s => {
          const a = s.assets.find(x => x.id === payload.id);
          if (a) Object.assign(a, payload.patch);
        });
        break;

      case 'removeAsset':
        mutate(s => {
          s.assets = s.assets.filter(x => x.id !== payload.id);
          for (const sq of s.squares) sq.assets = sq.assets.filter(a => a !== payload.id);
        });
        break;

      case 'requestAgent': {
        const req = addAgentRequest((payload.kind as string) ?? 'review', payload.note as string | undefined);
        return json({ ok: true, id: req.id });
      }

      case 'cancelAgentRequest':
        // User-side escape hatch: clear pending requests so a slow/unresponsive
        // agent can never leave a button stuck in its waiting state.
        resolveAgentRequest(payload.id as string | undefined);
        break;

      case 'clearAgentNotes':
        clearAgentNotes();
        break;

      case 'reset':
        resetState();
        break;

      // --- Named saves (multiple, restorable component setups) ---
      case 'listSaves':
        return json({ ok: true, saves: listSaves() });

      case 'saveState': {
        const save = createSave((payload.name as string) ?? 'Untitled', getState());
        return json({ ok: true, save });
      }

      case 'loadState': {
        const snapshot = loadSave(payload.id as string);
        if (!snapshot) return json({ error: 'Save not found' }, 404);
        replaceState(snapshot);
        return json({ ok: true });
      }

      case 'deleteSave':
        deleteSave(payload.id as string);
        return json({ ok: true, saves: listSaves() });

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }

    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
