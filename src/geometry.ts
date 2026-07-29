/**
 * Canvas geometry: marquee hit-testing, snapping with guides, distance
 * measurement, and the align/distribute maths.
 *
 * All of it works in VIEWPORT coordinates from getBoundingClientRect, never
 * offsetTop/offsetLeft. Those are relative to the nearest positioned ancestor,
 * which on this site is sometimes a page-level wrapper and sometimes the element
 * itself, and mixing the two coordinate spaces is exactly the bug that once made
 * the picker carousel unable to reach its first card.
 */

import { csOf, edWin } from "./context";
import { isEditable } from "./selectors";

export type Box = { left: number; top: number; right: number; bottom: number };
export type Guide = { x1: number; y1: number; x2: number; y2: number; kind: "align" | "grid" };
export type Span = { x1: number; y1: number; x2: number; y2: number; label: string };

export const rectOf = (el: Element) => el.getBoundingClientRect();

export function boxFrom(ax: number, ay: number, bx: number, by: number): Box {
  return {
    left: Math.min(ax, bx),
    top: Math.min(ay, by),
    right: Math.max(ax, bx),
    bottom: Math.max(ay, by),
  };
}

const intersects = (a: Box, r: DOMRect) =>
  a.left < r.right && a.right > r.left && a.top < r.bottom && a.bottom > r.top;

/**
 * Everything the marquee could catch, measured ONCE when the drag starts. The
 * page holds a couple of thousand nodes; re-querying and re-measuring them on
 * every pointermove would drop the drag to single-digit frames.
 */
export function marqueeCandidates(root: HTMLElement) {
  const out: Array<{ el: HTMLElement; rect: DOMRect }> = [];
  for (const el of root.querySelectorAll<HTMLElement>("*")) {
    if (!isEditable(el)) continue;

    // Decorative layers are not selectable. The rule is the browser's own: if a
    // click cannot land on it, a marquee must not catch it either. This site
    // covers its hero with an `aria-hidden` terrain canvas at
    // `pointer-events: none`, and without this the marquee returned that instead
    // of the copy sitting on top of it.
    const cs = csOf(el);
    if (cs.pointerEvents === "none" || cs.visibility === "hidden") continue;
    if (el.closest('[aria-hidden="true"]')) continue;

    const rect = el.getBoundingClientRect();
    // skip zero-size nodes and anything scrolled far out of reach
    if (rect.width < 4 || rect.height < 4) continue;
    if (rect.bottom < -2000 || rect.top > edWin().innerHeight + 2000) continue;
    out.push({ el, rect });
  }
  return out;
}

/**
 * Marquee selection returns the DEEPEST intersecting elements. Without this a
 * box drawn over a headline also catches every wrapper up to the section, and
 * you end up "selecting" the whole page. Dropping any element that contains
 * another hit leaves the leaves, which is what you were pointing at.
 */
export function marqueeHits(cands: Array<{ el: HTMLElement; rect: DOMRect }>, box: Box) {
  const hit = cands.filter((c) => intersects(box, c.rect)).map((c) => c.el);
  // one parent-chain walk per hit instead of contains() against every other hit:
  // a big marquee catches hundreds of nodes and the O(n^2) version stuttered
  const hitSet = new Set<Element>(hit);
  const ancestors = new Set<Element>();
  for (const el of hit) {
    let p = el.parentElement;
    while (p) {
      if (hitSet.has(p)) ancestors.add(p);
      p = p.parentElement;
    }
  }
  return hit.filter((el) => !ancestors.has(el));
}

/* --------------------------------------------------------------- snapping */

const GRID = 4;
const THRESHOLD = 6;

/**
 * Snap a vertical drag. Two magnets, strongest first: aligning the dragged
 * element's edge with a sibling's edge (that is a real design relationship), and
 * failing that the 4px grid, so values stay on the scale instead of landing on 37.
 */
export function snapVertical(
  moving: DOMRect,
  rawDelta: number,
  peers: DOMRect[],
): { delta: number; guides: Guide[] } {
  const top = moving.top + rawDelta;
  const bottom = moving.bottom + rawDelta;
  let best: { delta: number; guide: Guide } | null = null;

  for (const p of peers) {
    for (const [edge, value] of [
      [top, p.top],
      [top, p.bottom],
      [bottom, p.top],
      [bottom, p.bottom],
    ] as const) {
      const diff = value - edge;
      if (Math.abs(diff) <= THRESHOLD && (!best || Math.abs(diff) < Math.abs(best.delta - rawDelta))) {
        best = {
          delta: rawDelta + diff,
          guide: {
            x1: Math.min(moving.left, p.left) - 12,
            y1: value,
            x2: Math.max(moving.right, p.right) + 12,
            y2: value,
            kind: "align",
          },
        };
      }
    }
  }
  if (best) return { delta: best.delta, guides: [best.guide] };

  const snapped = Math.round(rawDelta / GRID) * GRID;
  return { delta: snapped, guides: [] };
}

/* ------------------------------------------------------------ measurement */

/**
 * The distances between two elements, the way Figma shows them when you hold a
 * modifier over a second object. This is the single most useful readout for the
 * kind of "why is this gap so big" question the editor exists to answer, because
 * it names the number instead of leaving it to be eyeballed.
 */
export function measure(a: DOMRect, b: DOMRect): Span[] {
  const spans: Span[] = [];
  const overlapX = a.left < b.right && a.right > b.left;
  const overlapY = a.top < b.bottom && a.bottom > b.top;

  if (overlapX) {
    const x = Math.max(a.left, b.left) + (Math.min(a.right, b.right) - Math.max(a.left, b.left)) / 2;
    if (b.top >= a.bottom) spans.push({ x1: x, y1: a.bottom, x2: x, y2: b.top, label: `${Math.round(b.top - a.bottom)}` });
    else if (a.top >= b.bottom) spans.push({ x1: x, y1: b.bottom, x2: x, y2: a.top, label: `${Math.round(a.top - b.bottom)}` });
  }
  if (overlapY) {
    const y = Math.max(a.top, b.top) + (Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) / 2;
    if (b.left >= a.right) spans.push({ x1: a.right, y1: y, x2: b.left, y2: y, label: `${Math.round(b.left - a.right)}` });
    else if (a.left >= b.right) spans.push({ x1: b.right, y1: y, x2: a.left, y2: y, label: `${Math.round(a.left - b.right)}` });
  }
  // neither axis overlaps: the two boxes sit diagonally, so report both legs
  if (!spans.length) {
    const dy = b.top >= a.bottom ? b.top - a.bottom : a.top - b.bottom;
    const dx = b.left >= a.right ? b.left - a.right : a.left - b.right;
    if (dy > 0) spans.push({ x1: a.left + a.width / 2, y1: Math.min(a.bottom, b.bottom), x2: a.left + a.width / 2, y2: Math.max(a.top, b.top), label: `${Math.round(dy)}` });
    if (dx > 0) spans.push({ x1: Math.min(a.right, b.right), y1: a.top + a.height / 2, x2: Math.max(a.left, b.left), y2: a.top + a.height / 2, label: `${Math.round(dx)}` });
  }
  return spans;
}

/* ------------------------------------------------------------- centring */

export type Centring = {
  leftGap: number;
  rightGap: number;
  topGap: number;
  bottomGap: number;
  /** how far off centre, in px; negative means it sits left / above centre */
  offsetX: number;
  offsetY: number;
  centeredX: boolean;
  centeredY: boolean;
  /** the parent's content box, so the overlay can draw the centre line */
  inner: Box;
};

/**
 * Is this element centred inside its parent, and if not, by how much? Measured
 * against the parent's CONTENT box (inside its padding), because that is the
 * space the child is actually centred within; using the border box reports a
 * padded element as off-centre when it is perfectly centred.
 *
 * Sub-pixel layout is normal, so anything within half a pixel counts as centred
 * rather than demanding an exact zero.
 */
export function centring(el: HTMLElement): Centring | null {
  const parent = el.parentElement;
  if (!parent) return null;
  const r = rectOf(el);
  const p = rectOf(parent);
  const cs = csOf(parent);
  const f = (v: string) => parseFloat(v) || 0;
  const inner: Box = {
    left: p.left + f(cs.paddingLeft),
    right: p.right - f(cs.paddingRight),
    top: p.top + f(cs.paddingTop),
    bottom: p.bottom - f(cs.paddingBottom),
  };
  const leftGap = r.left - inner.left;
  const rightGap = inner.right - r.right;
  const topGap = r.top - inner.top;
  const bottomGap = inner.bottom - r.bottom;
  const offsetX = (leftGap - rightGap) / 2;
  const offsetY = (topGap - bottomGap) / 2;
  return {
    leftGap: Math.round(leftGap),
    rightGap: Math.round(rightGap),
    topGap: Math.round(topGap),
    bottomGap: Math.round(bottomGap),
    offsetX: Math.round(offsetX * 10) / 10,
    offsetY: Math.round(offsetY * 10) / 10,
    centeredX: Math.abs(offsetX) <= 0.5,
    centeredY: Math.abs(offsetY) <= 0.5,
    inner,
  };
}

/* ------------------------------------------------------ align & distribute */

/**
 * The vertical gaps between a set of elements, in document order. Distribution
 * works on GAPS rather than on positions because these are flow elements: you
 * cannot place them absolutely without taking them out of the layout, but you can
 * make the space between them equal, which is what "distribute" means here.
 */
export function verticalGaps(els: HTMLElement[]) {
  const sorted = [...els].sort((a, b) => rectOf(a).top - rectOf(b).top);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    gaps.push(rectOf(sorted[i]).top - rectOf(sorted[i - 1]).bottom);
  }
  return { sorted, gaps };
}
