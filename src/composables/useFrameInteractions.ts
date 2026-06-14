import { ref, computed, type Ref } from 'vue';
import { imageToScreen, screenToImage, type Viewport, type Point } from '../lib/viewport';
import type { Square } from '../types';
import type { useWorkspaceStore } from '../stores/workspace';

type Store = ReturnType<typeof useWorkspaceStore>;
type Rect = { x: number; y: number; width: number; height: number };

const MIN_FRAME = 4; // min frame size in IMAGE px

export const RESIZE_HANDLES: { h: string; pos: string; cursor: string }[] = [
  { h: 'nw', pos: 'top:-5px;left:-5px', cursor: 'nwse-resize' },
  { h: 'n', pos: 'top:-5px;left:50%;transform:translateX(-50%)', cursor: 'ns-resize' },
  { h: 'ne', pos: 'top:-5px;right:-5px', cursor: 'nesw-resize' },
  { h: 'e', pos: 'top:50%;right:-5px;transform:translateY(-50%)', cursor: 'ew-resize' },
  { h: 'se', pos: 'bottom:-5px;right:-5px', cursor: 'nwse-resize' },
  { h: 's', pos: 'bottom:-5px;left:50%;transform:translateX(-50%)', cursor: 'ns-resize' },
  { h: 'sw', pos: 'bottom:-5px;left:-5px', cursor: 'nesw-resize' },
  { h: 'w', pos: 'top:50%;left:-5px;transform:translateY(-50%)', cursor: 'ew-resize' },
];

/**
 * All on-canvas frame interactions: drawing new frames, panning, resizing,
 * drag-to-move (group), copy/cut/paste (click-to-place), plus the geometry
 * helpers (screenRect / imgStyle / z-stacking / ghost preview) and the unified
 * pointer handlers.
 *
 * Drafts (drawCurrent / resizeDraft / moving) are kept LOCAL so the frame tracks
 * the cursor instantly; the committed value is dispatched to the store on
 * mouse-up and arrives back via SSE. Extracted from WorkspaceCanvas.vue.
 */
export function useFrameInteractions(
  store: Store,
  vp: Ref<Viewport>,
  containerRef: Ref<HTMLDivElement | null>,
) {
  // --- Draw mode (preview tracked in SCREEN space; committed in IMAGE space) ---
  const drawMode = ref(false);
  const drawing = ref(false);
  const drawStart = ref<Point>({ x: 0, y: 0 });
  const drawCurrent = ref<{ x: number; y: number; width: number; height: number } | null>(null);

  // --- Pan (✋ hand tool, holding Space, or middle mouse button) ---
  const spaceDown = ref(false);
  const handMode = ref(false);
  const panning = ref(false);
  const panLast = ref<Point>({ x: 0, y: 0 });

  // --- Resize (local draft rect during drag, commit once on mouse-up) ---
  const resizing = ref<{ id: string; handle: string; start: Rect } | null>(null);
  const resizeDraft = ref<({ id: string } & Rect) | null>(null);

  // --- Drag-to-move (a frame + its contained frames move together) ---
  const moving = ref<null | {
    id: string;
    origin: Record<string, { x: number; y: number }>;
    start: Point;
    dx: number;
    dy: number;
    moved: boolean;
  }>(null);

  // --- Copy / cut / paste (click-to-place) ---
  const clipboard = ref<null | { sourceId: string; cut: boolean }>(null);
  const placing = ref(false);
  const placeCursor = ref<Point | null>(null); // image coords under the cursor

  function toCanvasCoords(e: MouseEvent): Point {
    const rect = containerRef.value!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // Recompute a frame's rect from the dragged handle: the OPPOSITE edge(s) stay
  // anchored, the dragged edge(s) follow the mouse (in image space).
  function computeResizeRect(s: Rect, handle: string, m: Point): Rect {
    const right = s.x + s.width;
    const bottom = s.y + s.height;
    let { x, y } = s;
    let w = s.width;
    let h = s.height;
    if (handle.includes('w')) {
      x = Math.min(m.x, right - MIN_FRAME);
      w = right - x;
    }
    if (handle.includes('e')) {
      w = Math.max(m.x - s.x, MIN_FRAME);
    }
    if (handle.includes('n')) {
      y = Math.min(m.y, bottom - MIN_FRAME);
      h = bottom - y;
    }
    if (handle.includes('s')) {
      h = Math.max(m.y - s.y, MIN_FRAME);
    }
    return { x, y, width: w, height: h };
  }

  function startResize(sq: Square, handle: string, e: MouseEvent) {
    e.stopPropagation();
    store.selectedSquareId = sq.id;
    store.selectedAssetId = null;
    const start = { x: sq.x, y: sq.y, width: sq.width, height: sq.height };
    resizing.value = { id: sq.id, handle, start };
    resizeDraft.value = { id: sq.id, ...start };
  }

  // Frames geometrically inside `src` (client mirror of the server's containment).
  function framesInsideClient(src: Square): Square[] {
    return store.squares.filter(
      b =>
        b.id !== src.id &&
        b.x >= src.x && b.y >= src.y &&
        b.x + b.width <= src.x + src.width &&
        b.y + b.height <= src.y + src.height,
    );
  }

  function onFrameMouseDown(sq: Square, e: MouseEvent) {
    // In place mode, a click drops the pasted group — handle that first.
    if (placing.value) {
      dropPlacement(e);
      return;
    }
    // Pan modes take precedence even when the press starts on a frame.
    if (e.button === 1 || (e.button === 0 && (spaceDown.value || handMode.value))) {
      e.preventDefault();
      startPan(e);
      return;
    }
    // Frame mode on + press on an existing frame = start drawing a NESTED
    // frame. The template uses @mousedown.stop on each frame, which would
    // otherwise swallow the press before canvas-level onMouseDown could run.
    // Delegating keeps the draw-start logic in one place.
    if (drawMode.value && e.button === 0) {
      onMouseDown(e);
      return;
    }
    if (e.button !== 0) {
      return;
    }
    store.selectedSquareId = sq.id;
    store.selectedAssetId = null;
    const group = [sq, ...framesInsideClient(sq)];
    const origin: Record<string, { x: number; y: number }> = {};
    for (const g of group) {
      origin[g.id] = { x: g.x, y: g.y };
    }
    moving.value = { id: sq.id, origin, start: screenToImage(toCanvasCoords(e), vp.value), dx: 0, dy: 0, moved: false };
  }

  function copySelected(cut: boolean) {
    if (!store.selectedSquareId) {
      return;
    }
    clipboard.value = { sourceId: store.selectedSquareId, cut };
  }

  function startPlacing() {
    if (!clipboard.value) {
      return;
    }
    if (!store.squares.some(s => s.id === clipboard.value!.sourceId)) {
      clipboard.value = null;
      return;
    }
    drawMode.value = false;
    handMode.value = false;
    placing.value = true;
    placeCursor.value = null;
  }

  async function dropPlacement(e: MouseEvent) {
    const cb = clipboard.value;
    placing.value = false;
    if (!cb) {
      return;
    }
    const pt = screenToImage(toCanvasCoords(e), vp.value);
    await store.pasteFrame(cb.sourceId, pt.x, pt.y, cb.cut);
    if (cb.cut) {
      clipboard.value = null; // a cut is consumed once placed
    }
  }

  function cancelPlacing() {
    placing.value = false;
  }

  // Ghost preview rects for the group being placed, following the cursor.
  const placeGhost = computed(() => {
    if (!placing.value || !clipboard.value || !placeCursor.value) {
      return [];
    }
    const src = store.squares.find(s => s.id === clipboard.value!.sourceId);
    if (!src) {
      return [];
    }
    const group = [src, ...framesInsideClient(src)];
    const dx = placeCursor.value.x - src.x;
    const dy = placeCursor.value.y - src.y;
    return group.map(g => {
      const tl = imageToScreen({ x: g.x + dx, y: g.y + dy }, vp.value);
      return {
        left: tl.x + 'px',
        top: tl.y + 'px',
        width: g.width * vp.value.scale + 'px',
        height: g.height * vp.value.scale + 'px',
      };
    });
  });

  // --- Geometry: image-space rect -> screen-space CSS box ---
  // Stack frames by area: SMALLER frames sit on top so an inner/contained frame
  // stays clickable even when a larger frame fully overlaps it. Largest → z 1.
  const zById = computed<Record<string, number>>(() => {
    const sorted = [...store.squares].sort((a, b) => b.width * b.height - a.width * a.height);
    const m: Record<string, number> = {};
    sorted.forEach((s, i) => { m[s.id] = i + 1; });
    return m;
  });

  function screenRect(sq: Square) {
    let r: Rect = sq;
    if (resizeDraft.value && resizeDraft.value.id === sq.id) {
      r = resizeDraft.value;
    } else if (moving.value && moving.value.origin[sq.id]) {
      const o = moving.value.origin[sq.id];
      r = { x: o.x + moving.value.dx, y: o.y + moving.value.dy, width: sq.width, height: sq.height };
    }
    const tl = imageToScreen({ x: r.x, y: r.y }, vp.value);
    return {
      left: tl.x + 'px',
      top: tl.y + 'px',
      width: r.width * vp.value.scale + 'px',
      height: r.height * vp.value.scale + 'px',
      zIndex: String(zById.value[sq.id] ?? 1),
    };
  }

  const imgStyle = computed(() => {
    const img = store.sourceImage;
    if (!img) {
      return {};
    }
    const tl = imageToScreen({ x: 0, y: 0 }, vp.value);
    return {
      left: tl.x + 'px',
      top: tl.y + 'px',
      width: img.width * vp.value.scale + 'px',
      height: img.height * vp.value.scale + 'px',
    };
  });

  // --- Pointer handling ---
  function startPan(e: MouseEvent) {
    panning.value = true;
    panLast.value = { x: e.clientX, y: e.clientY };
  }

  function onMouseDown(e: MouseEvent) {
    // In place mode, a click on the empty canvas drops the pasted group.
    if (placing.value && e.button === 0) {
      dropPlacement(e);
      return;
    }
    // Middle button, space+drag, or the ✋ hand tool = pan, regardless of mode.
    if (e.button === 1 || (e.button === 0 && (spaceDown.value || handMode.value))) {
      e.preventDefault();
      startPan(e);
      return;
    }
    if (drawMode.value && e.button === 0) {
      drawing.value = true;
      const pos = toCanvasCoords(e);
      drawStart.value = pos;
      drawCurrent.value = { x: pos.x, y: pos.y, width: 0, height: 0 };
    }
  }

  function onMouseMove(e: MouseEvent) {
    if (placing.value) {
      placeCursor.value = screenToImage(toCanvasCoords(e), vp.value);
      return;
    }
    if (moving.value) {
      const m = screenToImage(toCanvasCoords(e), vp.value);
      moving.value.dx = m.x - moving.value.start.x;
      moving.value.dy = m.y - moving.value.start.y;
      if (Math.abs(moving.value.dx) * vp.value.scale > 3 || Math.abs(moving.value.dy) * vp.value.scale > 3) {
        moving.value.moved = true;
      }
      return;
    }
    if (resizing.value) {
      const m = screenToImage(toCanvasCoords(e), vp.value);
      resizeDraft.value = { id: resizing.value.id, ...computeResizeRect(resizing.value.start, resizing.value.handle, m) };
      return;
    }
    if (panning.value) {
      const dx = e.clientX - panLast.value.x;
      const dy = e.clientY - panLast.value.y;
      panLast.value = { x: e.clientX, y: e.clientY };
      store.setViewport({ ...vp.value, tx: vp.value.tx + dx, ty: vp.value.ty + dy });
      return;
    }
    if (!drawing.value || !drawCurrent.value) {
      return;
    }
    const pos = toCanvasCoords(e);
    drawCurrent.value = {
      x: Math.min(pos.x, drawStart.value.x),
      y: Math.min(pos.y, drawStart.value.y),
      width: Math.abs(pos.x - drawStart.value.x),
      height: Math.abs(pos.y - drawStart.value.y),
    };
  }

  function onMouseUp() {
    if (moving.value) {
      const mv = moving.value;
      moving.value = null;
      if (mv.moved) {
        store.moveFrameGroup(mv.id, mv.dx, mv.dy);
      }
      return;
    }
    if (resizing.value && resizeDraft.value) {
      const d = resizeDraft.value;
      store.updateSquare(d.id, { x: d.x, y: d.y, width: d.width, height: d.height });
      resizing.value = null;
      resizeDraft.value = null;
      return;
    }
    if (panning.value) {
      panning.value = false;
      return;
    }
    if (!drawing.value || !drawCurrent.value) {
      return;
    }
    drawing.value = false;
    const r = drawCurrent.value;
    // Require a meaningful drag (screen px), then convert to image space.
    if (r.width > 12 && r.height > 12) {
      const tl = screenToImage({ x: r.x, y: r.y }, vp.value);
      const br = screenToImage({ x: r.x + r.width, y: r.y + r.height }, vp.value);
      store.addSquare(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    }
    drawCurrent.value = null;
  }

  // Draw and Hand are mutually exclusive tools — turning one on releases the other.
  function toggleDraw() {
    drawMode.value = !drawMode.value;
    if (drawMode.value) {
      handMode.value = false;
    }
  }
  function toggleHand() {
    handMode.value = !handMode.value;
    if (handMode.value) {
      drawMode.value = false;
    }
  }

  const canvasCursor = computed(() => {
    if (placing.value) {
      return 'copy';
    }
    if (panning.value) {
      return 'grabbing';
    }
    if (handMode.value || spaceDown.value) {
      return 'grab';
    }
    return drawMode.value ? 'crosshair' : 'default';
  });

  return {
    // state
    drawMode, handMode, spaceDown, placing, clipboard, drawCurrent,
    RESIZE_HANDLES,
    // geometry
    screenRect, imgStyle, placeGhost, canvasCursor,
    // actions
    startResize, onFrameMouseDown, copySelected, startPlacing, cancelPlacing,
    toggleDraw, toggleHand,
    // pointer handlers
    onMouseDown, onMouseMove, onMouseUp, toCanvasCoords,
  };
}
