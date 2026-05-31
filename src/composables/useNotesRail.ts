import { ref, computed, watch, nextTick, type Ref } from 'vue';
import { imageToScreen, type Viewport, type Point } from '../lib/viewport';
import type { Square } from '../types';
import type { useWorkspaceStore } from '../stores/workspace';

type Store = ReturnType<typeof useWorkspaceStore>;

export interface TagSlot {
  sq: Square;
  tagX: number;
  tagY: number;
  cornerX: number;
  cornerY: number;
}

const TAG_H = 22; // approx tag height + gap, in px

/**
 * Notes-rail annotations: the XMind-style leader lines and floating labels that
 * connect on-canvas frames to their off-to-the-side notes rows.
 *
 * Everything here is SCREEN space derived from the live viewport, so it re-flows
 * as you zoom/pan. Extracted from WorkspaceCanvas.vue (which kept all of this
 * inline) so the component is wiring, not geometry. `bodyRef` is the canvas+rail
 * container (the shared coordinate space); `vp` is the viewport computed.
 */
export function useNotesRail(store: Store, bodyRef: Ref<HTMLDivElement | null>, vp: Ref<Viewport>) {
  // Notes rail is collapsible to give the canvas more room on small screens.
  const notesOpen = ref(true);
  // 🏷 toolbar toggle: show ALL frame labels at once (default = selected only).
  const showLabels = ref(false);

  // --- Hover leader line (hovering a notes-rail row highlights its frame) ---
  const hoveredFrameId = ref<string | null>(null);
  const railAnchor = ref<Point | null>(null);

  function hoverRow(id: string, e: MouseEvent) {
    hoveredFrameId.value = id;
    const body = bodyRef.value;
    if (!body) {
      return;
    }
    const b = body.getBoundingClientRect();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Left-middle of the hovered row, in body-local coords (shared with the
    // canvas's screen-space frame positions).
    railAnchor.value = { x: r.left - b.left, y: r.top - b.top + r.height / 2 };
  }

  // Open a frame from the rail. Unlike clicking a frame on the canvas, this does
  // NOT toggle — a rail click should always open the row, never close it.
  function focusRow(sq: Square) {
    store.selectedSquareId = sq.id;
    store.selectedAssetId = null;
  }

  const leaderLine = computed(() => {
    const id = hoveredFrameId.value;
    if (!id || !railAnchor.value) {
      return null;
    }
    const sq = store.squares.find(s => s.id === id);
    if (!sq) {
      return null;
    }
    // Frame anchor = right-middle of the frame in screen space; derived from the
    // live viewport so zooming/panning moves this endpoint live.
    const p = imageToScreen({ x: sq.x + sq.width, y: sq.y + sq.height / 2 }, vp.value);
    return { x1: p.x, y1: p.y, x2: railAnchor.value.x, y2: railAnchor.value.y };
  });

  // --- Selection leader line (persists while a frame is selected) ---
  // Points from the selected frame to its Notes-rail edit row, so it's obvious
  // where to type the intent. The row anchor is measured from the DOM after
  // render (its y depends on rail scroll/layout); the frame endpoint recomputes
  // live from the viewport.
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
  watch(
    () => [store.selectedSquareId, notesOpen.value, store.squares.length],
    measureSelectedRow,
  );

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

  // --- Floating labels (auto-staggered so coincident/nested frames don't pile) ---
  const labelLayout = computed<TagSlot[]>(() => {
    const placed: TagSlot[] = [];
    for (const sq of store.squares) {
      const tl = imageToScreen({ x: sq.x, y: sq.y }, vp.value);
      const tagX = tl.x;
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

  // By default only the SELECTED frame's label shows; the 🏷 toggle shows all.
  const visibleLabels = computed<TagSlot[]>(() =>
    showLabels.value
      ? labelLayout.value
      : labelLayout.value.filter(L => L.sq.id === store.selectedSquareId),
  );

  return {
    notesOpen,
    showLabels,
    hoveredFrameId,
    hoverRow,
    focusRow,
    leaderLine,
    measureSelectedRow,
    selectedLeaderLine,
    labelLayout,
    visibleLabels,
  };
}
