import type { Square } from '../types';

export interface ContainmentNode {
  id: string;
  label: string;
  children: ContainmentNode[];
}

/**
 * Determines whether `inner` should be considered nested inside `outer`.
 *
 * This predicate is the heart of how the visual layout becomes a hierarchy.
 * There are real trade-offs:
 *   - STRICT: inner's bounding box is fully inside outer's. Predictable, but a
 *     frame whose border slightly pokes out won't nest — frustrating when users
 *     draw by hand.
 *   - OVERLAP-RATIO: nest if (intersection area / inner area) >= threshold.
 *     Forgiving for hand-drawn frames, but a big frame overlapping a corner of
 *     another could falsely nest.
 *
 * TODO(you): implement this predicate. ~6-10 lines.
 * Suggested approach: compute the intersection rectangle between inner and outer,
 * its area, and return whether (intersectionArea / innerArea) >= OVERLAP_THRESHOLD.
 * Pick OVERLAP_THRESHOLD (e.g. 0.85) and tune to taste. Also guard against a
 * square "containing itself" and against zero-area squares.
 */
const OVERLAP_THRESHOLD = 0.85;

export function isContainedIn(inner: Square, outer: Square): boolean {
  if (inner.id === outer.id) {
    return false;
  }
  // --- default implementation (replace with your preferred strategy) ---
  const ix = Math.max(inner.x, outer.x);
  const iy = Math.max(inner.y, outer.y);
  const ix2 = Math.min(inner.x + inner.width, outer.x + outer.width);
  const iy2 = Math.min(inner.y + inner.height, outer.y + outer.height);
  const interArea = Math.max(0, ix2 - ix) * Math.max(0, iy2 - iy);
  const innerArea = inner.width * inner.height;
  if (innerArea <= 0) {
    return false;
  }
  return interArea / innerArea >= OVERLAP_THRESHOLD;
}

/**
 * Builds a forest of squares based on geometric nesting. Each square's parent is
 * the SMALLEST other square that contains it (so deeply nested frames attach to
 * their immediate parent, not a distant ancestor).
 */
export function computeContainment(squares: Square[]): ContainmentNode[] {
  const parentOf = new Map<string, string | null>();

  for (const inner of squares) {
    let bestParent: Square | null = null;
    for (const outer of squares) {
      if (!isContainedIn(inner, outer)) {
        continue;
      }
      const outerArea = outer.width * outer.height;
      if (!bestParent || outerArea < bestParent.width * bestParent.height) {
        bestParent = outer;
      }
    }
    parentOf.set(inner.id, bestParent?.id ?? null);
  }

  const nodes = new Map<string, ContainmentNode>(
    squares.map(s => [s.id, { id: s.id, label: s.label, children: [] }]),
  );
  const roots: ContainmentNode[] = [];

  for (const sq of squares) {
    const parentId = parentOf.get(sq.id);
    const node = nodes.get(sq.id)!;
    if (parentId) {
      nodes.get(parentId)!.children.push(node);
    }
    else {
      roots.push(node);
    }
  }

  return roots;
}
