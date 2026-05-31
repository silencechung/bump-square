<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useWorkspaceStore } from '../stores/workspace';
import type { Square } from '../types';
import { imageToScreen, screenToImage, type Point } from '../lib/viewport';
import { useViewport } from '../composables/useViewport';

const store = useWorkspaceStore();
const containerRef = ref<HTMLDivElement | null>(null);

// Viewport (zoom/pan/fit/focus) extracted into a composable; the component just
// wires its handlers to pointer events.
const { canvasSize, fitted, vp, zoomPct, fit, focusRect, oneToOne, zoomAtCursor } =
  useViewport(store, containerRef);

// Draw mode: user is actively drawing a new square. Preview is tracked in
// SCREEN space (so it sits under the cursor); committed coords are IMAGE space.
const drawMode = ref(false);
const drawing = ref(false);
const drawStart = ref<Point>({ x: 0, y: 0 });
const drawCurrent = ref<{ x: number; y: number; width: number; height: number } | null>(null);

// Pan state. Pan can be triggered three ways: the ✋ hand tool (handMode),
// holding Space, or the middle mouse button.
const spaceDown = ref(false);
const handMode = ref(false);
const panning = ref(false);
const panLast = ref<Point>({ x: 0, y: 0 });

// For label editing
const editingLabelId = ref<string | null>(null);
const editingLabelValue = ref('');

// Frame resize. Like drawing, we keep a LOCAL draft rect during the drag (instant,
// no SSE round-trip per move) and commit once via updateSquare on mouse-up.
type Rect = { x: number; y: number; width: number; height: number };
const resizing = ref<{ id: string; handle: string; start: Rect } | null>(null);
const resizeDraft = ref<({ id: string } & Rect) | null>(null);
const MIN_FRAME = 4; // min frame size in IMAGE px
const RESIZE_HANDLES: { h: string; pos: string; cursor: string }[] = [
  { h: 'nw', pos: 'top:-5px;left:-5px', cursor: 'nwse-resize' },
  { h: 'n', pos: 'top:-5px;left:50%;transform:translateX(-50%)', cursor: 'ns-resize' },
  { h: 'ne', pos: 'top:-5px;right:-5px', cursor: 'nesw-resize' },
  { h: 'e', pos: 'top:50%;right:-5px;transform:translateY(-50%)', cursor: 'ew-resize' },
  { h: 'se', pos: 'bottom:-5px;right:-5px', cursor: 'nwse-resize' },
  { h: 's', pos: 'bottom:-5px;left:50%;transform:translateX(-50%)', cursor: 'ns-resize' },
  { h: 'sw', pos: 'bottom:-5px;left:-5px', cursor: 'nesw-resize' },
  { h: 'w', pos: 'top:50%;left:-5px;transform:translateY(-50%)', cursor: 'ew-resize' },
];

// Recompute a frame's rect from the handle being dragged: the OPPOSITE edge(s)
// stay anchored, the dragged edge(s) follow the mouse (in image space).
function computeResizeRect(s: Rect, handle: string, m: Point): Rect {
  const right = s.x + s.width;
  const bottom = s.y + s.height;
  let { x, y } = s;
  let w = s.width;
  let h = s.height;
  if (handle.includes('w')) { x = Math.min(m.x, right - MIN_FRAME); w = right - x; }
  if (handle.includes('e')) { w = Math.max(m.x - s.x, MIN_FRAME); }
  if (handle.includes('n')) { y = Math.min(m.y, bottom - MIN_FRAME); h = bottom - y; }
  if (handle.includes('s')) { h = Math.max(m.y - s.y, MIN_FRAME); }
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

// --- Drag-to-move (a frame + its contained frames move together) ---
const moving = ref<null | {
  id: string;
  origin: Record<string, { x: number; y: number }>;
  start: Point;
  dx: number;
  dy: number;
  moved: boolean;
}>(null);

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
  if (placing.value) { dropPlacement(e); return; }
  // Pan modes take precedence even when the press starts on a frame.
  if (e.button === 1 || (e.button === 0 && (spaceDown.value || handMode.value))) {
    e.preventDefault();
    startPan(e);
    return;
  }
  if (drawMode.value || e.button !== 0) return;
  store.selectedSquareId = sq.id;
  store.selectedAssetId = null;
  const group = [sq, ...framesInsideClient(sq)];
  const origin: Record<string, { x: number; y: number }> = {};
  for (const g of group) origin[g.id] = { x: g.x, y: g.y };
  moving.value = { id: sq.id, origin, start: screenToImage(toCanvasCoords(e), vp.value), dx: 0, dy: 0, moved: false };
}

// --- Copy / cut / paste (click-to-place) ---
const clipboard = ref<null | { sourceId: string; cut: boolean }>(null);
const placing = ref(false);
const placeCursor = ref<Point | null>(null); // image coords under the cursor

function copySelected(cut: boolean) {
  if (!store.selectedSquareId) return;
  clipboard.value = { sourceId: store.selectedSquareId, cut };
}

function startPlacing() {
  if (!clipboard.value) return;
  if (!store.squares.some(s => s.id === clipboard.value!.sourceId)) { clipboard.value = null; return; }
  drawMode.value = false;
  handMode.value = false;
  placing.value = true;
  placeCursor.value = null;
}

async function dropPlacement(e: MouseEvent) {
  const cb = clipboard.value;
  placing.value = false;
  if (!cb) return;
  const pt = screenToImage(toCanvasCoords(e), vp.value);
  await store.pasteFrame(cb.sourceId, pt.x, pt.y, cb.cut);
  if (cb.cut) clipboard.value = null; // a cut is consumed once placed
}

// Ghost preview rects for the group being placed, following the cursor.
const placeGhost = computed(() => {
  if (!placing.value || !clipboard.value || !placeCursor.value) return [];
  const src = store.squares.find(s => s.id === clipboard.value!.sourceId);
  if (!src) return [];
  const group = [src, ...framesInsideClient(src)];
  const dx = placeCursor.value.x - src.x;
  const dy = placeCursor.value.y - src.y;
  return group.map(g => {
    const tl = imageToScreen({ x: g.x + dx, y: g.y + dy }, vp.value);
    return {
      left: tl.x + 'px', top: tl.y + 'px',
      width: g.width * vp.value.scale + 'px',
      height: g.height * vp.value.scale + 'px',
    };
  });
});

// Focus loop: zoom into a single frame to confirm its exact bounds.
function focusSquare(sq: Square) {
  store.selectedSquareId = sq.id;
  store.selectedAssetId = null;
  focusRect({ x: sq.x, y: sq.y, width: sq.width, height: sq.height });
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
});

function onKeyDown(e: KeyboardEvent) {
  // Escape always wins, even from inside an input: blur the field, drop the
  // selection, and pop back to the overview. "Esc = leave, back to overview."
  if (e.code === 'Escape') {
    if (placing.value) { placing.value = false; return; } // cancel a pending paste first
    (document.activeElement as HTMLElement | null)?.blur();
    store.selectedSquareId = null;
    handMode.value = false;
    drawMode.value = false;
    fit();
    return;
  }
  if (isTyping(e)) return;                    // don't hijack keys while typing
  // Undo / redo / clipboard (Ctrl on Win/Linux, ⌘ on macOS).
  if (e.ctrlKey || e.metaKey) {
    const k = e.key.toLowerCase();
    if (k === 'z') { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); return; }
    if (k === 'y') { e.preventDefault(); store.redo(); return; }
    if (k === 'c') { copySelected(false); return; }
    if (k === 'x') { copySelected(true); return; }
    if (k === 'v') { e.preventDefault(); startPlacing(); return; }
  }
  if (e.code === 'Space') {
    e.preventDefault();
    spaceDown.value = true;
  } else if (e.code === 'KeyF') {
    fit();                                    // back to overview, keep selection
  }
}
function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') spaceDown.value = false;
}
function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

// Auto-fit when a new image arrives.
watch(() => store.sourceImage?.url, url => {
  fitted.value = false;
  if (url) fit();
});

watch(() => store.step, step => {
  if (step === 'layout') drawMode.value = false;
});

function toCanvasCoords(e: MouseEvent): Point {
  const rect = containerRef.value!.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// --- Frame geometry: image-space rect -> screen-space CSS box ---
// During a resize drag the draft rect wins, so the frame follows the cursor
// instantly (the committed value arrives later via SSE).
// Stack frames by area: SMALLER frames sit on top so an inner/contained frame
// stays clickable even when a larger frame fully overlaps it. (Clicking the
// large frame's uncovered area still selects it.) Largest → z 1 … smallest → z n.
const zById = computed<Record<string, number>>(() => {
  const sorted = [...store.squares].sort(
    (a, b) => b.width * b.height - a.width * a.height,
  );
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
  if (!img) return {};
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
  if (placing.value && e.button === 0) { dropPlacement(e); return; }
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
  if (!drawing.value || !drawCurrent.value) return;
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
    if (mv.moved) store.moveFrameGroup(mv.id, mv.dx, mv.dy);
    return;
  }
  if (resizing.value && resizeDraft.value) {
    const d = resizeDraft.value;
    store.updateSquare(d.id, { x: d.x, y: d.y, width: d.width, height: d.height });
    resizing.value = null;
    resizeDraft.value = null;
    return;
  }
  if (panning.value) { panning.value = false; return; }
  if (!drawing.value || !drawCurrent.value) return;
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

function onWheel(e: WheelEvent) {
  e.preventDefault();
  zoomAtCursor(toCanvasCoords(e), e.deltaY);
}

function onSquareDragOver(e: DragEvent, squareId: string) {
  e.preventDefault();
  store.selectedSquareId = squareId;
}

function onSquareDrop(e: DragEvent, squareId: string) {
  e.preventDefault();
  const assetId = e.dataTransfer?.getData('assetId');
  if (assetId) store.placeAssetInSquare(assetId, squareId);
}

function selectSquare(id: string) {
  store.selectedSquareId = id;
  store.selectedAssetId = null;
}

function startEditLabel(sq: Square) {
  // Also select the frame, so editing from the notes rail locates it on canvas.
  store.selectedSquareId = sq.id;
  store.selectedAssetId = null;
  editingLabelId.value = sq.id;
  editingLabelValue.value = sq.label;
}

function commitLabel(id: string) {
  if (editingLabelValue.value.trim()) {
    store.updateSquare(id, { label: editingLabelValue.value.trim() });
  }
  editingLabelId.value = null;
}

// Auto-grow the comment textarea with its content, up to a cap; past the cap it
// scrolls (with the scrollbar hidden via .no-scrollbar). Keeps short notes
// compact and long ones readable without a premature scrollbar.
const COMMENT_MAX_PX = 200;
function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, COMMENT_MAX_PX) + 'px';
}
const vAutosize = {
  // Measure on the next frame: at mount time the rail may not be laid out yet,
  // so scrollHeight would be taken at the wrong width and overshoot.
  mounted: (el: HTMLTextAreaElement) => requestAnimationFrame(() => autoGrow(el)),
};

function onCommentInput(sq: Square, e: Event) {
  const el = e.target as HTMLTextAreaElement;
  store.updateSquare(sq.id, { comment: el.value });
  autoGrow(el);
}

// Feature #1 — comment discoverability.
// Each frame's comment area is always present (no longer hidden until selected);
// this function decides WHICH of three things it shows. You're shaping the core
// UX trade-off here: how aggressively do we surface "you can comment here"
// versus keeping a canvas full of frames uncluttered?
//
//   'editing' → the editable text input (the user is focused on this frame)
//   'card'    → a read-only, always-visible comment card (so existing intent is
//               visible at a glance, even when nothing is selected)
//   'hint'    → a faint "💬 add comment" affordance inviting a first comment
//
// Inputs you can use: sq.comment (string | undefined) and
// store.selectedSquareId (the id of the currently selected frame, or null).
type CommentDisplay = 'editing' | 'card' | 'hint';
function commentDisplay(sq: Square): CommentDisplay {
  // While renaming THIS frame, don't open its comment editor: two autofocus
  // fields (name input + comment textarea, both v-focus) would fight for focus
  // and the name input would blur → commit → the rename closes instantly.
  if (store.selectedSquareId === sq.id && editingLabelId.value !== sq.id) return 'editing';
  if (sq.comment && sq.comment.trim()) return 'card';
  return 'hint';
}

// Agent-authored inferred role. Read-only in the UI and styled distinctly from
// the user's own comment, so the two form a double-confirmation: the agent
// proposes, the user accepts it as their own note or dismisses it.
function hasAiNote(sq: Square) {
  return !!(sq.aiNote && sq.aiNote.trim());
}
function acceptAiNote(sq: Square) {
  if (!sq.aiNote) return;
  store.updateSquare(sq.id, { comment: sq.aiNote, aiNote: '' });
}
function dismissAiNote(sq: Square) {
  store.updateSquare(sq.id, { aiNote: '' });
}

// --- Notes rail + leader line (XMind-style: annotations live off to the side) ---
// The rail is in SCREEN space, so it stays constant size no matter the zoom.
// Hovering a rail row draws a leader line back to that frame's CURRENT on-screen
// position — recomputed from the live viewport, so the line tracks the frame as
// you zoom and pan.
const bodyRef = ref<HTMLDivElement | null>(null);
const hoveredFrameId = ref<string | null>(null);
const railAnchor = ref<Point | null>(null);

function hoverRow(id: string, e: MouseEvent) {
  hoveredFrameId.value = id;
  const body = bodyRef.value;
  if (!body) return;
  const b = body.getBoundingClientRect();
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  // Left-middle of the hovered row, expressed in body-local coordinates so it
  // shares a coordinate space with the canvas's screen-space frame positions.
  railAnchor.value = { x: r.left - b.left, y: r.top - b.top + r.height / 2 };
}

// Open a frame from the rail. Unlike clicking a frame on the canvas, this does
// NOT toggle — a rail click should always open the row, never close it. Esc or
// an empty-canvas click still deselects.
function focusRow(sq: Square) {
  store.selectedSquareId = sq.id;
  store.selectedAssetId = null;
}

const leaderLine = computed(() => {
  const id = hoveredFrameId.value;
  if (!id || !railAnchor.value) return null;
  const sq = store.squares.find(s => s.id === id);
  if (!sq) return null;
  // Frame anchor = right-middle of the frame in screen space. Because it's
  // derived from the live viewport, zooming/panning moves this endpoint live.
  const p = imageToScreen({ x: sq.x + sq.width, y: sq.y + sq.height / 2 }, vp.value);
  return { x1: p.x, y1: p.y, x2: railAnchor.value.x, y2: railAnchor.value.y };
});

// Selection leader line: whenever a frame is SELECTED, draw a dashed connector
// from the frame to its Notes-rail row (its edit area), so it's obvious where to
// type the intent. Unlike the hover line this persists while the frame stays
// selected. The rail-row anchor is measured from the DOM after render (the row's
// y depends on the rail's scroll/layout); the frame endpoint recomputes live
// from the viewport, so the line tracks zoom/pan.
const selectedRailAnchor = ref<Point | null>(null);
async function measureSelectedRow() {
  await nextTick();
  const id = store.selectedSquareId;
  const body = bodyRef.value;
  if (!id || !notesOpen.value || !body) {
    selectedRailAnchor.value = null;
    return;
  }
  const row = body.querySelector(`[data-rail-id="${id}"]`) as HTMLElement | null;
  if (!row) {
    selectedRailAnchor.value = null;
    return;
  }
  const b = body.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  selectedRailAnchor.value = { x: r.left - b.left, y: r.top - b.top + r.height / 2 };
}
watch(() => [store.selectedSquareId, notesOpen.value, store.squares.length], measureSelectedRow);

const selectedLeaderLine = computed(() => {
  const id = store.selectedSquareId;
  if (!id || !selectedRailAnchor.value) {
    return null;
  }
  const sq = store.squares.find(s => s.id === id);
  if (!sq) {
    return null;
  }
  const p = imageToScreen({ x: sq.x + sq.width, y: sq.y + sq.height / 2 }, vp.value);
  return { x1: p.x, y1: p.y, x2: selectedRailAnchor.value.x, y2: selectedRailAnchor.value.y };
});

// Floating-label placement. Each frame's label wants to sit just above its
// top-left corner; when two would overlap (coincident / nested frames on a
// small image), we nudge the later one upward until it clears. Returns screen-
// space positions, so it all re-flows live as you zoom and pan.
const TAG_H = 22; // approx tag height + gap, in px
interface TagSlot { sq: Square; tagX: number; tagY: number; cornerX: number; cornerY: number }
const labelLayout = computed<TagSlot[]>(() => {
  const placed: TagSlot[] = [];
  for (const sq of store.squares) {
    const tl = imageToScreen({ x: sq.x, y: sq.y }, vp.value);
    let tagX = tl.x;
    let tagY = tl.y - TAG_H - 4; // default: just above the corner
    // Climb upward while we'd collide with an already-placed nearby tag.
    let guard = 0;
    while (
      guard++ < 30 &&
      placed.some(p => Math.abs(p.tagX - tagX) < 130 && Math.abs(p.tagY - tagY) < TAG_H)
    ) {
      tagY -= TAG_H;
    }
    placed.push({ sq, tagX, tagY, cornerX: tl.x, cornerY: tl.y });
  }
  return placed;
});

// Which labels actually render. By default only the SELECTED frame's label shows
// (clicking a frame reveals its name) — the notes rail already gives a hover
// leader line, so always-on labels just clutter and overlap the image. The 🏷
// toolbar toggle (showLabels) overrides this to surface ALL labels at once.
const visibleLabels = computed<TagSlot[]>(() =>
  showLabels.value
    ? labelLayout.value
    : labelLayout.value.filter(L => L.sq.id === store.selectedSquareId),
);

const canvasCursor = computed(() => {
  if (placing.value) return 'copy';
  if (panning.value) return 'grabbing';
  if (handMode.value || spaceDown.value) return 'grab';
  return drawMode.value ? 'crosshair' : 'default';
});

// Floating XMind labels overlay the image. Default: only the SELECTED frame's
// label shows (click to reveal). The toolbar toggle flips this to "show all".
const showLabels = ref(false);
// Notes rail is collapsible to give the canvas more room on small screens.
const notesOpen = ref(true);

// Draw and Hand are mutually exclusive tools — turning one on releases the other.
function toggleDraw() {
  drawMode.value = !drawMode.value;
  if (drawMode.value) handMode.value = false;
}
function toggleHand() {
  handMode.value = !handMode.value;
  if (handMode.value) drawMode.value = false;
}
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden bg-zinc-900">
    <!-- Toolbar -->
    <div class="h-12 shrink-0 border-b border-zinc-800/80 flex items-center px-3 gap-2">
      <!-- Tools as consistent toggle switches (on/off state reads at a glance).
           Frame & Hand are mutually exclusive modes; Labels is a view toggle. -->
      <div class="flex items-center gap-4">
        <button
          class="flex items-center gap-2 text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
          role="switch" :aria-checked="drawMode"
          title="Draw a new frame"
          @click="toggleDraw"
        >
          <span class="w-4 text-center">▢</span> Frame
          <span class="relative w-9 h-5 rounded-full transition-colors" :class="drawMode ? 'bg-violet-400' : 'bg-zinc-600'">
            <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" :class="drawMode ? 'left-[18px]' : 'left-0.5'"></span>
          </span>
        </button>
        <button
          class="flex items-center gap-2 text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
          role="switch" :aria-checked="handMode"
          title="Pan the canvas (or hold Space / middle-drag)"
          @click="toggleHand"
        >
          <span class="w-4 text-center">✋</span> Hand
          <span class="relative w-9 h-5 rounded-full transition-colors" :class="handMode ? 'bg-violet-400' : 'bg-zinc-600'">
            <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" :class="handMode ? 'left-[18px]' : 'left-0.5'"></span>
          </span>
        </button>
        <button
          class="flex items-center gap-2 text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
          role="switch" :aria-checked="showLabels"
          title="Toggle: show ALL frame labels (default shows only the selected frame's)"
          @click="showLabels = !showLabels"
        >
          <span class="w-4 text-center">🏷</span> Labels
          <span class="relative w-9 h-5 rounded-full transition-colors" :class="showLabels ? 'bg-violet-400' : 'bg-zinc-600'">
            <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" :class="showLabels ? 'left-[18px]' : 'left-0.5'"></span>
          </span>
        </button>
      </div>
      <span class="text-zinc-500 text-xs ml-3">{{ store.squares.length }} frame{{ store.squares.length !== 1 ? 's' : '' }}</span>

      <!-- Undo / redo (Ctrl+Z · Ctrl+Shift+Z / Ctrl+Y). -->
      <div class="flex items-center gap-1 ml-2">
        <button
          class="w-8 h-8 rounded-full flex items-center justify-center text-zinc-300 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-default transition-colors"
          title="復原 (Ctrl+Z)"
          :disabled="!store.canUndo"
          @click="store.undo()"
        >↶</button>
        <button
          class="w-8 h-8 rounded-full flex items-center justify-center text-zinc-300 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-default transition-colors"
          title="重做 (Ctrl+Shift+Z / Ctrl+Y)"
          :disabled="!store.canRedo"
          @click="store.redo()"
        >↷</button>
      </div>

      <!-- Stage 2 — layout confirm: ask Claude to synthesize the intent
           structure tree from the confirmed frames + comments + aiNotes. -->
      <button
        class="text-sm px-5 py-1.5 rounded-full font-medium transition-colors disabled:opacity-40 disabled:cursor-default"
        :class="store.isRequestPending('generate-structure')
          ? 'bg-amber-300 text-amber-950 hover:bg-amber-200'
          : 'bg-violet-400 text-violet-950 hover:bg-violet-300'"
        :disabled="store.squares.length === 0"
        :title="store.isRequestPending('generate-structure')
          ? 'Claude is generating… click to cancel'
          : 'Confirm layout → have Claude generate the intent structure tree'"
        @click="store.isRequestPending('generate-structure') ? store.cancelAgentRequest('generate-structure') : store.requestAgent('generate-structure')"
      >
        {{ store.isRequestPending('generate-structure') ? '⏳ 產生中… ✕' : '🧩 產生意圖結構' }}
      </button>

      <!-- View controls (zoom), grouped as one unit, distinct from the tools. -->
      <div class="ml-auto flex items-center gap-1 bg-zinc-800/50 rounded-full p-0.5">
        <button
          class="text-sm px-3 py-1.5 rounded-full text-zinc-200 hover:bg-zinc-700 transition-colors"
          title="Fit image to view"
          @click="fit"
        >Fit</button>
        <button
          class="text-sm px-3 py-1.5 rounded-full text-zinc-200 hover:bg-zinc-700 transition-colors"
          title="Actual size (100%)"
          @click="oneToOne"
        >1:1</button>
        <span class="text-zinc-500 text-xs tabular-nums w-11 text-right pr-1.5">{{ zoomPct }}%</span>
      </div>
    </div>

    <!-- Body: canvas + notes rail, with a leader-line overlay spanning both -->
    <div ref="bodyRef" class="flex-1 relative flex overflow-hidden">
    <!-- Canvas area -->
    <div
      ref="containerRef"
      class="flex-1 relative overflow-hidden"
      :style="{ cursor: canvasCursor }"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
      @wheel="onWheel"
      @dblclick="fit"
    >
      <!-- Place-mode hint banner. -->
      <div
        v-if="placing"
        class="absolute top-3 left-1/2 -translate-x-1/2 z-50 text-sm px-4 py-1.5 rounded-full bg-violet-400 text-violet-950 font-medium shadow-lg pointer-events-none"
      >點擊放置{{ clipboard?.cut ? '（剪下）' : '' }} · Esc 取消</div>

      <!-- Source image as the canvas backdrop (image space, transformed) -->
      <img
        v-if="store.sourceImage"
        :src="store.sourceImage.url"
        class="absolute pointer-events-none select-none max-w-none"
        :style="imgStyle"
        alt="source"
      />

      <!-- Existing squares -->
      <div
        v-for="sq in store.squares"
        :key="sq.id"
        class="absolute rounded transition-colors"
        :class="[
          store.selectedSquareId === sq.id
            ? 'border-4 border-violet-400 shadow-[0_0_0_1px_rgba(167,139,250,0.45)] cursor-move'
            : hoveredFrameId === sq.id ? 'border-2 border-violet-300/70' : 'border-2 border-zinc-500 hover:border-zinc-400',
          handMode ? 'cursor-grab' : '',
        ]"
        :style="screenRect(sq)"
        @mousedown.stop="onFrameMouseDown(sq, $event)"
        @click.stop="selectSquare(sq.id)"
        @dblclick.stop="focusSquare(sq)"
        @dragover="onSquareDragOver($event, sq.id)"
        @drop="onSquareDrop($event, sq.id)"
      >
        <!-- Resize handles: only on the selected frame. Drag to grow/shrink the
             frame's bounds (放大縮小框限). Each anchors the opposite edge. -->
        <template v-if="store.selectedSquareId === sq.id">
          <div
            v-for="hd in RESIZE_HANDLES"
            :key="hd.h"
            class="absolute w-2.5 h-2.5 bg-violet-400 border border-white/90 rounded-sm z-30"
            :style="hd.pos + ';cursor:' + hd.cursor"
            @mousedown.stop.prevent="startResize(sq, hd.h, $event)"
          />
        </template>
        <!-- (Labels moved off the frame corner into floating tags — see the
             v-for="L in labelLayout" block below. Stops them stacking on top of
             each other for small / nested frames.) -->

        <!-- Assets inside square -->
        <div class="absolute inset-0 p-1 flex flex-wrap gap-1 content-start overflow-hidden">
          <div
            v-for="assetId in sq.assets"
            :key="assetId"
            class="text-[10px] bg-zinc-800/80 text-zinc-300 rounded px-1.5 py-0.5 truncate max-w-full"
          >{{ store.assets.find(a => a.id === assetId)?.label ?? assetId }}</div>
        </div>

        <!-- (Comments moved to the right-side notes rail to avoid overlapping
             dense/nested frames — see the <aside> below.) -->
      </div>

      <!-- Paste placement: a ghost outline of the clipboard group follows the
           cursor; the next click drops it (Esc cancels). -->
      <div
        v-for="(g, i) in placeGhost"
        :key="'ghost-' + i"
        class="absolute rounded border-2 border-dashed border-violet-400 bg-violet-400/10 pointer-events-none z-40"
        :style="g"
      />

      <!-- Floating frame labels (XMind-style). Detached from the frame corner
           and auto-staggered upward so coincident / nested frames don't pile
           up; each links back to its frame via a connector line in the SVG.
           Default: only the selected frame's label; 🏷 toolbar toggle shows all. -->
      <div
        v-for="L in visibleLabels"
        :key="'tag-' + L.sq.id"
        class="absolute z-20 flex items-center gap-1"
        :style="{ left: L.tagX + 'px', top: L.tagY + 'px' }"
      >
        <!-- Display-only on the canvas. Renaming lives in the Notes panel (one
             editor only → no autofocus fights). Double-click opens that editor. -->
        <span
          class="text-sm px-2 py-1 rounded-md cursor-pointer transition-colors whitespace-nowrap shadow-md"
          :class="store.selectedSquareId === L.sq.id
            ? 'bg-violet-600 text-white font-medium'
            : 'bg-zinc-800/90 text-zinc-200 hover:bg-zinc-700'"
          title="Click to select · rename it in the Notes panel"
          @click.stop="focusRow(L.sq)"
          @dblclick.stop="startEditLabel(L.sq)"
          @mouseenter="hoveredFrameId = L.sq.id"
          @mouseleave="hoveredFrameId = null"
        >{{ L.sq.label }}</span>
      </div>

      <!-- Live draw preview (screen space) -->
      <div
        v-if="drawCurrent && drawCurrent.width > 2"
        class="absolute border-2 border-violet-400 border-dashed bg-violet-900/10 pointer-events-none"
        :style="{ left: drawCurrent.x + 'px', top: drawCurrent.y + 'px', width: drawCurrent.width + 'px', height: drawCurrent.height + 'px' }"
      />

      <!-- Empty state hint -->
      <div
        v-if="store.squares.length === 0 && !drawMode"
        class="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <p class="text-zinc-700 text-sm">Click "+ Add Frame" to draw · double-click a frame to confirm its bounds · double-click empty (or Esc) for overview</p>
      </div>
    </div>
    <!-- end canvas -->

    <!-- Notes rail: every frame's label + intent comment, parked off to the
         side so it never overlaps dense or nested frames. Screen space → it
         stays the same size at any zoom. -->
    <aside v-if="notesOpen" class="w-64 shrink-0 h-full border-l border-zinc-700/60 bg-[#2c2c33] overflow-y-auto overflow-x-hidden no-scrollbar" @scroll="measureSelectedRow">
      <div class="px-3 py-2.5 flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-300 border-b border-zinc-700/60 sticky top-0 bg-[#2c2c33]/95 backdrop-blur z-10">
        <button
          class="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-colors normal-case text-xl leading-none"
          title="Collapse notes rail"
          @click="notesOpen = false"
        >›</button>
        <span>📝 Notes · {{ store.squares.length }}</span>
      </div>
      <div
        v-if="store.squares.length === 0"
        class="px-3 py-4 text-xs text-zinc-600 leading-relaxed"
      >No frames yet. Draw one to start annotating its intent.</div>

      <div
        v-for="sq in store.squares"
        :key="sq.id"
        :data-rail-id="sq.id"
        class="px-3 py-2 border-b border-zinc-700/40 cursor-pointer transition-colors"
        :class="store.selectedSquareId === sq.id ? 'bg-zinc-700/70' : 'hover:bg-zinc-700/40'"
        @mouseenter="hoverRow(sq.id, $event)"
        @mouseleave="hoveredFrameId = null"
        @click="focusRow(sq)"
      >
        <!-- label (rename here) + selection dot + controls -->
        <div class="flex items-center gap-1.5 mb-1">
          <span
            class="w-1.5 h-1.5 rounded-full shrink-0"
            :class="store.selectedSquareId === sq.id ? 'bg-violet-400' : 'bg-zinc-600'"
          ></span>
          <input
            v-if="editingLabelId === sq.id"
            :value="editingLabelValue"
            class="flex-1 min-w-0 text-sm font-medium bg-zinc-900 border border-violet-500 rounded px-1.5 py-0.5 text-zinc-100 focus:outline-none"
            @input="editingLabelValue = ($event.target as HTMLInputElement).value"
            @blur="commitLabel(sq.id)"
            @keydown.enter="commitLabel(sq.id)"
            @keydown.escape="editingLabelId = null"
            @click.stop
            v-focus
          />
          <span
            v-else
            class="text-sm font-medium truncate cursor-text hover:text-violet-200"
            :class="store.selectedSquareId === sq.id ? 'text-violet-300' : 'text-zinc-300'"
            title="Click to rename"
            @click.stop="startEditLabel(sq)"
          >{{ sq.label }}</span>
          <span class="ml-auto flex items-center gap-1.5 shrink-0">
            <button
              v-if="editingLabelId !== sq.id"
              class="w-8 h-8 rounded-md flex items-center justify-center text-zinc-400 hover:text-violet-300 hover:bg-zinc-700 transition-colors"
              title="Rename frame"
              aria-label="Rename frame"
              @click.stop="startEditLabel(sq)"
            >
              <svg viewBox="0 0 16 16" class="w-4 h-4" fill="currentColor"><path d="M11.6 1.6a1.35 1.35 0 0 1 1.9 1.9l-.8.8-1.9-1.9.8-.8zM9.9 3.3l1.9 1.9-6.1 6.1-2.4.5.5-2.4 6.1-6.1z"/></svg>
            </button>
            <button
              v-if="editingLabelId !== sq.id"
              class="w-8 h-8 rounded-md flex items-center justify-center text-zinc-400 hover:text-violet-300 hover:bg-zinc-700 transition-colors"
              title="Duplicate frame (含內部 frames)"
              aria-label="Duplicate frame"
              @click.stop="store.duplicateFrame(sq.id)"
            >
              <svg viewBox="0 0 16 16" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V3.5a1.5 1.5 0 0 0-1.5-1.5H3.5A1.5 1.5 0 0 0 2 3.5v5.5a1.5 1.5 0 0 0 1.5 1.5h2"/></svg>
            </button>
            <button
              class="w-8 h-8 rounded-md flex items-center justify-center text-zinc-400 hover:text-red-400 hover:bg-zinc-700 transition-colors"
              title="Delete frame"
              aria-label="Delete frame"
              @click.stop="store.removeSquare(sq.id)"
            >
              <svg viewBox="0 0 16 16" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
            </button>
          </span>
        </div>

        <!-- Agent's inferred role: read-only, distinct violet styling. The
             user confirms (✓ adopt) or dismisses (✕) — that's the second half
             of the double-confirmation. -->
        <div
          v-if="hasAiNote(sq)"
          class="mb-1.5 rounded-lg border border-fuchsia-600/40 bg-fuchsia-900/25 px-2.5 py-1.5"
          @click.stop
        >
          <div class="flex items-center gap-1 mb-0.5">
            <span class="text-xs uppercase tracking-wide text-fuchsia-300/80">🤖 AI 推斷</span>
            <span class="ml-auto flex items-center gap-1.5">
              <button
                class="text-xs text-violet-300 hover:text-violet-100 transition-colors"
                title="採用為我的註解"
                @click.stop="acceptAiNote(sq)"
              >✓ 採用</button>
              <button
                class="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                title="略過這個推斷"
                @click.stop="dismissAiNote(sq)"
              >✕</button>
            </span>
          </div>
          <p class="text-sm text-fuchsia-200/90 italic leading-snug whitespace-pre-wrap break-words">{{ sq.aiNote }}</p>
        </div>

        <!-- comment: editing / card / hint, decided by commentDisplay().
             A textarea (not an input) so long intent notes wrap instead of
             scrolling off the side. -->
        <textarea
          v-if="commentDisplay(sq) === 'editing'"
          rows="1"
          placeholder="Describe this frame's intent…"
          :value="sq.comment ?? ''"
          class="block w-full box-border max-w-full text-sm bg-zinc-900 border border-violet-500/60 rounded-lg px-2.5 py-1.5 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none overflow-y-auto overflow-x-hidden no-scrollbar leading-snug break-words"
          @input="onCommentInput(sq, $event)"
          @click.stop
          v-focus
          v-autosize
        ></textarea>
        <p
          v-else-if="commentDisplay(sq) === 'card'"
          class="text-sm text-violet-100 bg-violet-900/25 border border-violet-700/40 rounded-lg px-2.5 py-1.5 leading-snug whitespace-pre-wrap break-words"
        >💬 {{ sq.comment }}</p>
        <span v-else class="text-xs text-zinc-600 italic">💬 add comment</span>
      </div>
    </aside>
    <!-- Collapsed → a thin vertical strip to reopen (mirrors the Agent panel). -->
    <button
      v-else
      class="w-8 shrink-0 border-l border-zinc-700/60 bg-[#2c2c33] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/60 transition-colors flex flex-col items-center justify-center gap-2"
      title="Show notes rail"
      @click="notesOpen = true"
    >
      <span class="text-xl leading-none">‹</span>
      <span class="text-xs uppercase tracking-wider [writing-mode:vertical-rl]">📝 Notes</span>
    </button>

    <!-- Leader line overlay: spans canvas + rail. Points from a frame's live
         on-screen edge to the hovered rail row, so it tracks zoom/pan. -->
    <svg class="absolute inset-0 w-full h-full pointer-events-none">
      <!-- connector from each floating label tag down to its frame corner -->
      <line
        v-for="L in visibleLabels"
        :key="'conn-' + L.sq.id"
        :x1="L.tagX + 6" :y1="L.tagY + 20"
        :x2="L.cornerX + 1" :y2="L.cornerY + 1"
        :stroke="store.selectedSquareId === L.sq.id || hoveredFrameId === L.sq.id ? '#a78bfa' : '#52525b'"
        stroke-width="1"
      />
      <!-- selection leader line: from the SELECTED frame to its notes edit row,
           persists while selected so it's clear where to write the intent. -->
      <template v-if="selectedLeaderLine">
        <line
          :x1="selectedLeaderLine.x1" :y1="selectedLeaderLine.y1"
          :x2="selectedLeaderLine.x2" :y2="selectedLeaderLine.y2"
          stroke="#c4b5fd" stroke-width="1.5" stroke-dasharray="5 4"
        />
        <circle :cx="selectedLeaderLine.x1" :cy="selectedLeaderLine.y1" r="3.5" fill="#c4b5fd" />
        <circle :cx="selectedLeaderLine.x2" :cy="selectedLeaderLine.y2" r="3.5" fill="#c4b5fd" />
      </template>

      <!-- rail leader line (hovering a notes-rail row) -->
      <line
        v-if="leaderLine"
        :x1="leaderLine.x1" :y1="leaderLine.y1"
        :x2="leaderLine.x2" :y2="leaderLine.y2"
        stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="4 3"
      />
      <circle v-if="leaderLine" :cx="leaderLine.x1" :cy="leaderLine.y1" r="3" fill="#a78bfa" />
    </svg>
    </div>
    <!-- end body -->
  </div>
</template>

<style>
/* Keep the notes rail scrollable but hide the scrollbar chrome (and never show
   a horizontal one). */
.no-scrollbar {
  scrollbar-width: none;        /* Firefox + modern Chromium */
}
.no-scrollbar::-webkit-scrollbar {
  display: none;                /* Chrome/Safari */
}
</style>
