/**
 * The edit target: WHICH document and window the editor is operating on.
 *
 * By default that is the page the editor is mounted in. When the device frame
 * is open (the Chrome-style viewport emulator), the target becomes the frame's
 * same-origin iframe instead: the parent keeps the panel and the brains, the
 * iframe is the canvas. Same-origin means the parent can reach straight into
 * `iframe.contentDocument`, so there is no postMessage protocol, no embedded
 * copy of the editor, and one undo history across both.
 *
 * Everything in the editor that touches the DOM goes through edDoc()/edWin()
 * instead of the globals. Two cross-realm traps this file also owns:
 *
 * - `instanceof HTMLElement` is FALSE for elements from another realm (the
 *   iframe has its own HTMLElement constructor). isElem() duck-types instead.
 * - `getComputedStyle` must come from the element's own window. csOf() routes
 *   through ownerDocument.defaultView.
 *
 * Lazy on purpose: no top-level window/document access, so the module can be
 * evaluated during SSR without throwing.
 */

let target: { win: Window; doc: Document } | null = null;

export const edWin = (): Window => target?.win ?? window;
export const edDoc = (): Document => target?.doc ?? document;

/** point the editor at an iframe's realm, or back at the host page with no args */
export function setEditTarget(win?: Window | null, doc?: Document | null) {
  target = win && doc ? { win, doc } : null;
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
