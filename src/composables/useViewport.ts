import { ref, computed, onMounted, watch, type Ref } from 'vue';
import {
  fitToView,
  focusRect as focusRectVp,
  zoomAt,
  type Viewport,
  type Rect,
  type Point,
} from '../lib/viewport';
import type { useWorkspaceStore } from '../stores/workspace';

type Store = ReturnType<typeof useWorkspaceStore>;

/**
 * Canvas viewport (zoom / pan / fit / focus) wiring.
 *
 * The transform MATH lives in lib/viewport.ts (pure functions); this composable
 * owns the reactive glue: container size tracking, the auto-fit lifecycle, and
 * the wheel-zoom handler. The viewport value itself is the store's (it's local
 * UI state there), so this reads/writes `store.viewport`.
 *
 * Extracted from WorkspaceCanvas.vue so the component is wiring, not mechanics.
 */
export function useViewport(store: Store, containerRef: Ref<HTMLDivElement | null>) {
  const canvasSize = ref({ width: 800, height: 600 });
  // Has the viewport been auto-fitted to the current image yet?
  const fitted = ref(false);

  const vp = computed<Viewport>(() => store.viewport);
  const zoomPct = computed(() => Math.round(vp.value.scale * 100));

  function fit() {
    const img = store.sourceImage;
    if (!img) {
      return;
    }
    store.setViewport(
      fitToView(img.width, img.height, canvasSize.value.width, canvasSize.value.height),
    );
    fitted.value = true;
  }

  /** Frame an image-space rect in the center (used to confirm a frame's bounds). */
  function focusRect(rect: Rect) {
    store.setViewport(focusRectVp(rect, canvasSize.value.width, canvasSize.value.height));
  }

  function oneToOne() {
    const img = store.sourceImage;
    if (!img) {
      return;
    }
    // 1:1 pixels, centered.
    store.setViewport({
      scale: 1,
      tx: (canvasSize.value.width - img.width) / 2,
      ty: (canvasSize.value.height - img.height) / 2,
    });
  }

  /** Wheel = smooth, cursor-anchored zoom. Caller passes the cursor in canvas coords. */
  function zoomAtCursor(cursor: Point, deltaY: number) {
    const factor = Math.exp(-deltaY * 0.0015); // smooth, trackpad-friendly
    store.setViewport(zoomAt(vp.value, cursor, factor));
  }

  onMounted(() => {
    if (containerRef.value) {
      const ro = new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect;
        canvasSize.value = { width, height };
        if (store.sourceImage && !fitted.value) {
          fit();
        }
      });
      ro.observe(containerRef.value);
    }
  });

  // Auto-fit when a new image arrives.
  watch(() => store.sourceImage?.url, url => {
    fitted.value = false;
    if (url) {
      fit();
    }
  });

  return { canvasSize, fitted, vp, zoomPct, fit, focusRect, oneToOne, zoomAtCursor };
}
