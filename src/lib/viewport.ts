/**
 * Viewport transform math for the workspace canvas.
 *
 * Two coordinate spaces:
 *  - IMAGE space: the source image's natural pixels. Squares & assets live here.
 *    This is what we persist and what Claude reasons about over MCP.
 *  - SCREEN space: pixels inside the canvas container (what the user clicks).
 *
 * The mapping is an affine transform with uniform scale:
 *
 *     screen = image * scale + translate
 *
 * so a Viewport is just { scale, tx, ty }. Keeping these as pure functions
 * (no DOM, no Vue) makes the coordinate logic testable and keeps the canvas
 * component focused on event wiring.
 */

export interface Viewport {
  scale: number;
  tx: number;
  ty: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_SCALE = 0.05;
// High ceiling on purpose: the tool must let users zoom WAY into small designs
// (e.g. a 52px icon) to confirm a frame's bounds pixel-by-pixel. 8x was too low.
export const MAX_SCALE = 32;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Image-space point -> screen-space point. */
export function imageToScreen(p: Point, vp: Viewport): Point {
  return { x: p.x * vp.scale + vp.tx, y: p.y * vp.scale + vp.ty };
}

/** Screen-space point -> image-space point (inverse of imageToScreen). */
export function screenToImage(p: Point, vp: Viewport): Point {
  return { x: (p.x - vp.tx) / vp.scale, y: (p.y - vp.ty) / vp.scale };
}

/**
 * Compute a viewport that fits the whole image inside the container with
 * `padding` px of breathing room, centered.
 */
export function fitToView(
  imgW: number,
  imgH: number,
  containerW: number,
  containerH: number,
  padding = 32,
): Viewport {
  if (imgW <= 0 || imgH <= 0 || containerW <= 0 || containerH <= 0) {
    return { scale: 1, tx: 0, ty: 0 };
  }
  const scale = clampScale(
    Math.min((containerW - padding * 2) / imgW, (containerH - padding * 2) / imgH),
  );
  return {
    scale,
    tx: (containerW - imgW * scale) / 2,
    ty: (containerH - imgH * scale) / 2,
  };
}

/**
 * Compute a viewport that frames an image-space rectangle in the center of the
 * container with `padding` px of breathing room. Used to "focus" a single frame
 * so the user can confirm its exact bounds, then `fitToView` returns to overview.
 */
export function focusRect(
  rect: Rect,
  containerW: number,
  containerH: number,
  padding = 48,
): Viewport {
  if (rect.width <= 0 || rect.height <= 0 || containerW <= 0 || containerH <= 0) {
    return { scale: 1, tx: 0, ty: 0 };
  }
  const scale = clampScale(
    Math.min((containerW - padding * 2) / rect.width, (containerH - padding * 2) / rect.height),
  );
  return {
    scale,
    tx: (containerW - rect.width * scale) / 2 - rect.x * scale,
    ty: (containerH - rect.height * scale) / 2 - rect.y * scale,
  };
}

/**
 * Zoom by `factor` (>1 zooms in, <1 zooms out) while keeping the IMAGE point
 * under `cursor` (a screen-space point) pinned in place — i.e. whatever pixel of
 * the design is under the mouse stays under the mouse as you scroll.
 *
 * The invariant to preserve:
 *     screenToImage(cursor, oldVp)  ===  screenToImage(cursor, newVp)
 *
 * Steps:
 *   1. Find the image point currently under the cursor (use screenToImage).
 *   2. Compute the new clamped scale (use clampScale on vp.scale * factor).
 *   3. Solve for the new tx/ty so that imageToScreen(imgPt, newVp) lands back
 *      on `cursor`. From `screen = image*scale + translate`, that means
 *      translate = cursor - imgPt * newScale.
 *
 * @param vp      current viewport
 * @param cursor  cursor position in SCREEN space
 * @param factor  multiplicative zoom factor (e.g. 1.1 to zoom in, 0.9 out)
 * @returns the new viewport
 */
export function zoomAt(vp: Viewport, cursor: Point, factor: number): Viewport {
  const imgPt = screenToImage(cursor, vp);   // image pixel under the cursor now
  const scale = clampScale(vp.scale * factor);
  // Re-pin: solve screen = image*scale + translate for translate.
  return {
    scale,
    tx: cursor.x - imgPt.x * scale,
    ty: cursor.y - imgPt.y * scale,
  };
}
