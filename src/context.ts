/**
 * The edit target: WHICH document and window the editor is operating on.
 *
 * By default that is the page the editor is mounted in. When the viewport canvas
 * is open, several same-origin iframes are live at once (see Frames.tsx): the
 * parent keeps the panel and the brains, and whichever frame the pointer is in
 * becomes the canvas. Same-origin means the parent reaches straight into
 * `iframe.contentDocument`, so there is no postMessage protocol, no embedded
 * copy of the editor, and one undo history across all of them.
 *
 * Two lists, deliberately:
 *   target  the ACTIVE realm, what edWin()/edDoc() answer with. One at a time,
 *           because a click happens in one place.
 *   realms  EVERY live realm. The preview stylesheet is compiled into all of
 *           them, which is what makes one edit appear in three viewports at once.
 *
 * Everything in the editor that touches the DOM goes through edDoc()/edWin()
 * instead of the globals. Two cross-realm traps this file also owns:
 *
 * - `instanceof HTMLElement` is FALSE for elements from another realm (an iframe
 *   has its own HTMLElement constructor). isElem() duck-types instead.
 * - `getComputedStyle` must come from the element's own window. csOf() routes
 *   through ownerDocument.defaultView.
 *
 * Lazy on purpose: no top-level window/document access, so the module can be
 * evaluated during SSR without throwing.
 */

export type Realm = { win: Window; doc: Document };

let target: Realm | null = null;
let realms: Realm[] = [];

export const edWin = (): Window => target?.win ?? window;
export const edDoc = (): Document => target?.doc ?? document;

/** point the editor at an iframe's realm, or back at the host page with no args */
export function setEditTarget(win?: Window | null, doc?: Document | null) {
  target = win && doc ? { win, doc } : null;
}

/**
 * Every realm a change should be painted into. With no frames open that is just
 * the host page; with the canvas open it is each frame, and NOT the host page,
 * whose document is hidden behind the canvas anyway.
 */
export function setRealms(list: Realm[]) {
  realms = list;
}

export function allRealms(): Realm[] {
  return realms.length ? realms.filter((r) => isLive(r)) : [{ win: window, doc: document }];
}

/** a frame that has navigated or been torn down must not be written to */
function isLive(r: Realm): boolean {
  try {
    return Boolean(r.doc && r.doc.body && r.win && !r.win.closed);
  } catch {
    return false; // the realm went away mid-teardown
  }
}

export const isFramed = () => target !== null;

/** realm-safe element check: `instanceof HTMLElement` lies across an iframe boundary */
export function isElem(n: unknown): n is HTMLElement {
  return (
    !!n &&
    typeof n === "object" &&
    (n as Node).nodeType === 1 &&
    typeof (n as HTMLElement).style === "object"
  );
}

/** realm-safe computed style: always the element's own window's view of it */
export function csOf(el: Element): CSSStyleDeclaration {
  return (el.ownerDocument.defaultView ?? window).getComputedStyle(el);
}
