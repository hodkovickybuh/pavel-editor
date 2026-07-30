/**
 * The edit store: every change the editor makes, with undo, redo, reset, and
 * persistence across the dev server's hot reloads.
 *
 * Persistence is not a luxury here. The dev server rebuilds on every file save,
 * React re-renders, and inline styles vanish with it. Without re-applying from
 * storage you would lose an hour of dragging to one stray keystroke in an editor
 * window. Elements are keyed by DOM PATH rather than class, because CSS-module
 * hashes change between builds while the tree shape does not.
 */

import {
  PROPS,
  STYLE_PROPS,
  type NumProp,
  breakpointEdges,
  cascadeRival,
  describe,
  domPath,
  fromDomPath,
  numericTokens,
  readProp,
  readStyle,
  resetBreakpoints,
  round,
  runtimeRef,
  tokenFor,
  winningRuleFor,
} from "./selectors";
import { edWin, isElem } from "./context";
import { looksTailwind, tailwindFor } from "./tailwind";

export type ChangeProp = NumProp | string;

/**
 * Which breakpoint band an edit belongs to. Bands come from the page's OWN media
 * queries (see breakpointEdges) and are written `lo-hi`, or `lo-` for the top
 * band. A value chosen at 768px and a value chosen at 390px are now different
 * identities, editable independently, reported into different media queries.
 * "d" and "m" are the legacy two-bucket ids and still resolve, so a session
 * saved by an older build keeps working.
 */
export type Bucket = string;

export const bucketOf = (): Bucket => {
  const w = edWin().innerWidth;
  let lo = 0;
  for (const edge of breakpointEdges()) {
    if (w <= edge) return `${lo}-${edge}`;
    lo = edge + 1;
  }
  return `${lo}-`;
};

/** the media query a band means, which is exactly what the report has to say */
export const mediaFor = (b: Bucket): string => {
  if (b === "d") return "(min-width: 901px)";
  if (b === "m") return "(max-width: 900px)";
  const [lo, hi] = b.split("-");
  const parts: string[] = [];
  if (Number(lo) > 0) parts.push(`(min-width: ${lo}px)`);
  if (hi) parts.push(`(max-width: ${hi}px)`);
  return parts.join(" and ") || "all";
};

/** how a band reads to a person */
export const bucketLabel = (b: Bucket): string => {
  if (b === "d") return "desktop";
  if (b === "m") return "narrow";
  const [lo, hi] = b.split("-");
  if (!hi) return `${lo}px and wider`;
  return Number(lo) === 0 ? `up to ${hi}px` : `${lo}–${hi}px`;
};

/** widest band first, so the report reads base-rule-then-overrides */
export const bucketOrder = (b: Bucket): number => {
  if (b === "d") return -901;
  if (b === "m") return -900;
  const [lo] = b.split("-");
  return -Number(lo);
};

/** the pseudo-state an edit belongs to; "" is the resting state */
export type EditState = "" | "hover" | "focus-visible" | "active";

export const changeKey = (path: string, prop: string, bucket?: Bucket, state?: EditState) =>
  `${path}|${prop}${bucket ? `|${bucket}` : ""}${state ? `|${state}` : ""}`;

/** where to write a property, whichever of the two tables declares it */
function cssKeyOf(prop: string): string | null {
  if (prop in PROPS) return PROPS[prop as NumProp].css;
  if (prop in STYLE_PROPS) return STYLE_PROPS[prop].css;
  return null;
}

export type Change = {
  /** identity: dom path plus the property, so one element can carry several */
  key: string;
  path: string;
  label: string;
  file: string | null;
  selector: string;
  prop: ChangeProp;
  /** the value the stylesheet had before the editor touched it */
  base: string;
  value: string;
  /** the TARGET viewport width when the change was made; <=900 means "this
      probably belongs in the phone media query", and the report says so */
  vw?: number;
  /** true for the margin-bottom half of an isolate move: not a design decision
      of its own, it exists to keep everything below the element in place */
  comp?: boolean;
  /** the hashed-class runtime selector + match index: the cross-realm resolver */
  rtSel?: string;
  rtIdx?: number;
  /** a freehand stroke (SVG points) when the note was drawn as a circling mark */
  mark?: string;
  /** innerHTML snapshots for text edits, so styled fragments survive undo/restore */
  baseHtml?: string;
  valueHtml?: string;
  /** breakpoint bucket for style props; content changes (text/image/note) have none */
  bucket?: Bucket;
  /** the pseudo-state this value belongs to; absent means the resting state */
  state?: EditState;
  /** a more specific rule that already sets this property: the applied CSS will
      LOSE to it even though the preview won, so the report has to say so */
  rival?: string;
  /** a design token this value already equals, named so the applier writes it */
  tok?: string;
};

/**
 * Find a change's element in the CURRENT realm. The runtime selector goes
 * first: it survives the desktop/frame DOM differences that shift nth-child
 * paths. The path is the fallback for elements no module class reaches.
 */
/** describe(), upgraded by the cascade: when no CSS-module file is known, name
    the stylesheet rule that actually wins for this property */
function describeFor(el: HTMLElement, prop: string) {
  const d = describe(el);
  if (d.file) return d;
  const w = winningRuleFor(el, prop);
  if (w) return { file: w.file, selector: w.selector, label: `${w.file} ${w.selector}` };
  return d;
}

function resolveTarget(c: Pick<Change, "path" | "rtSel" | "rtIdx">): HTMLElement | null {
  if (c.rtSel) {
    try {
      const list = edWin().document.querySelectorAll<HTMLElement>(c.rtSel);
      const el = list[c.rtIdx ?? 0] ?? list[0];
      if (el && isElem(el)) return el;
    } catch {
      /* fall through to the path */
    }
  }
  return fromDomPath(c.path);
}

type Snapshot = { key: string; before: Change | undefined; after: Change | undefined };

const STORAGE = "pavel-editor-v1";

class EditStore {
  changes = new Map<string, Change>();
  /** stable per-element ids for the preview stylesheet's selectors */
  private pathIds = new Map<string, number>();
  private nextId = 1;
  private undoStack: Snapshot[][] = [];
  private redoStack: Snapshot[][] = [];
  private listeners = new Set<() => void>();
  /** cached so useSyncExternalStore sees a stable reference between real changes */
  private snapshotCache: Change[] = [];
  private dirty = true;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => {
    if (this.dirty) {
      this.snapshotCache = [...this.changes.values()];
      this.dirty = false;
    }
    return this.snapshotCache;
  };

  private emit() {
    this.dirty = true;
    this.listeners.forEach((fn) => fn());
    this.save();
  }

  /** the persistence key for an element, exposed so a drag can snapshot entries */
  pathOf = (el: HTMLElement) => domPath(el);

  /**
   * WHICH STATE is being edited. The resting state is only half a design; a
   * hover value is a design decision that no live-page editor could express
   * before, because you cannot hover an element and drag a slider at once.
   * `force` mirrors the state's values onto the resting element so it can be
   * SEEN while it is edited; it is preview-only and never recorded.
   */
  state: EditState = "";
  force = true;
  setState(s: EditState) {
    this.state = s;
    this.syncSheet();
    this.dirty = true;
    this.listeners.forEach((fn) => fn());
  }

  /** the change key for the CURRENT band and state */
  keyOf = (path: string, prop: string) => changeKey(path, prop, bucketOf(), this.state);

  /** numeric design tokens, cached per realm: the scan walks every stylesheet */
  private tokCache: { doc: Document; list: Array<{ name: string; px: number }> } | null = null;
  tokens() {
    const doc = edWin().document;
    if (this.tokCache?.doc !== doc) this.tokCache = { doc, list: numericTokens() };
    return this.tokCache.list;
  }

  /** forget everything cached about the page: new realm, or a fresh stylesheet */
  invalidate() {
    this.tokCache = null;
    resetBreakpoints();
  }

  /** true while the page is showing ORIGINALS with all edits suspended */
  previewOff = false;
  /** runtime-only object URLs for dropped images, keyed like changes */
  private imgUrls = new Map<string, string>();

  /**
   * THE PREVIEW ENGINE. Style edits do not touch el.style any more: they are
   * compiled into one injected stylesheet where every rule sits behind the
   * media query of the bucket it was made in. That is what makes editing
   * truthful across viewports: a margin chosen on desktop exists only above
   * 900px, the phone keeps its own values, both can be edited independently,
   * and a reset leaves the page byte-identical because there is nothing inline
   * to forget. Rules use !important so they outrank the page's own cascade;
   * scrub previews use inline-important, which outranks even that, then unwind.
   */
  syncSheet() {
    const doc = edWin().document;
    /** `${bucket}|${state}|${id}` -> declarations */
    const decls = new Map<string, string[]>();
    const push = (k: string, decl: string) => decls.set(k, [...(decls.get(k) ?? []), decl]);
    for (const c of this.changes.values()) {
      if (!c.bucket) continue;
      if (c.prop === "text" || c.prop === "note" || c.prop === "image" || c.prop === "order") continue;
      const el = resolveTarget(c);
      if (!el) continue;
      let id = this.pathIds.get(c.path);
      if (!id) {
        id = this.nextId++;
        this.pathIds.set(c.path, id);
      }
      if (el.getAttribute("data-pe-id") !== String(id)) el.setAttribute("data-pe-id", String(id));
      const decl = `${c.prop}: ${c.value} !important;`;
      push(`${c.bucket}|${c.state ?? ""}|${id}`, decl);
      // the force mirror: while a state is being edited, show it at rest too.
      // Appended after the real resting rules, so it wins the preview and
      // disappears the moment the state selector goes back to rest.
      if (c.state && this.force && this.state === c.state) push(`${c.bucket}||${id}`, decl);
    }
    const byBucket = new Map<Bucket, string[]>();
    for (const [k, list] of decls) {
      const [bucket, state, id] = k.split("|");
      const rule = `[data-pe-id="${id}"]${state ? `:${state}` : ""} { ${list.join(" ")} }`;
      byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), rule]);
    }
    const css = [...byBucket.entries()]
      .sort((a, b) => bucketOrder(a[0]) - bucketOrder(b[0]))
      .map(([b, rules]) => `@media ${mediaFor(b)} {\n${rules.join("\n")}\n}`)
      .join("\n");
    let tag = doc.getElementById("pavel-editor-preview") as HTMLStyleElement | null;
    if (!tag) {
      tag = doc.createElement("style");
      tag.id = "pavel-editor-preview";
      doc.head.appendChild(tag);
    }
    if (tag.textContent !== css) tag.textContent = css;
    tag.media = this.previewOff ? "not all" : "all";
  }

  canUndo = () => this.undoStack.length > 0;
  canRedo = () => this.redoStack.length > 0;

  /**
   * BEFORE / AFTER: flip the whole page between the edited state and the
   * originals. Styles fall back to "" (the stylesheet), text and images to the
   * recorded base. Any write while showing originals flips back first, so an
   * edit is never silently layered on the wrong state.
   */
  toggleOriginal() {
    this.previewOff = !this.previewOff;
    for (const c of this.changes.values()) {
      if (c.prop === "text") {
        const el = resolveTarget(c);
        if (!el) continue;
        if (this.previewOff) {
          if (c.baseHtml != null) el.innerHTML = c.baseHtml;
          else el.textContent = c.base;
        } else if (c.valueHtml != null) el.innerHTML = c.valueHtml;
        else el.textContent = c.value;
      } else if (c.prop === "image") {
        const el = resolveTarget(c);
        if (!el) continue;
        const url = this.imgUrls.get(c.key);
        (el as HTMLImageElement).src = this.previewOff ? c.base : (url ?? c.base);
      }
    }
    this.syncSheet(); // styles flip wholesale via the sheet's media attribute
    this.dirty = true;
    this.listeners.forEach((fn) => fn());
    return this.previewOff;
  }

  private ensureLive() {
    if (this.previewOff) this.toggleOriginal();
  }

  /**
   * A/B VARIANTS: stash the whole change-set under a letter, restore it later.
   * Loading clears the undo history (the swap is a state change, not an edit).
   * Dropped-image swaps are session-runtime and do not travel between variants.
   */
  saveVariant(slot: "A" | "B") {
    try {
      sessionStorage.setItem(`pe-variant-${slot}`, JSON.stringify([...this.changes.values()].filter((c) => c.prop !== "image")));
    } catch {
      /* storage full/blocked: the toast will still say saved, acceptable for a preview tool */
    }
  }

  hasVariant(slot: "A" | "B") {
    try {
      return sessionStorage.getItem(`pe-variant-${slot}`) !== null;
    } catch {
      return false;
    }
  }

  /**
   * HANDOFF: the whole session as a file. A designer edits on their machine and
   * sends this; whoever has the codebase drops it back in and sees exactly the
   * same page, with the notes and the marks, before a line of CSS is written.
   */
  exportSession(): string {
    return JSON.stringify(
      {
        tool: "pavel-editor",
        version: 1,
        url: location.href,
        viewport: { w: edWin().innerWidth, h: edWin().innerHeight },
        changes: [...this.changes.values()].filter((c) => c.prop !== "image"),
      },
      null,
      2,
    );
  }

  importSession(text: string): number {
    let parsed: { changes?: Change[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      return 0;
    }
    if (!Array.isArray(parsed.changes)) return 0;
    this.applyChangeSet(parsed.changes);
    return parsed.changes.length;
  }

  loadVariant(slot: "A" | "B") {
    let saved: Change[];
    try {
      const raw = sessionStorage.getItem(`pe-variant-${slot}`);
      if (!raw) return false;
      saved = JSON.parse(raw);
    } catch {
      return false;
    }
    this.applyChangeSet(saved);
    return true;
  }

  /** replace the whole change-set as ONE undo step: variants and imports both */
  private applyChangeSet(saved: Change[]) {
    this.ensureLive();
    const prev = new Map(this.changes);
    // text back to originals; styles are wholesale-recompiled by the sheet
    for (const c of this.changes.values()) {
      if (c.prop !== "text") continue;
      const el = resolveTarget(c);
      if (!el) continue;
      if (c.baseHtml != null) el.innerHTML = c.baseHtml;
      else el.textContent = c.base;
    }
    this.changes.clear();
    for (const c of saved) {
      if (c.prop === "text") {
        const el = resolveTarget(c);
        if (el) {
          if (c.valueHtml != null) el.innerHTML = c.valueHtml;
          else el.textContent = c.value;
        }
      }
      this.changes.set(c.key, c);
    }
    this.syncSheet();
    // the swap is ONE undo step over the union of both states, so cmd+Z after
    // loading a variant returns exactly to where the page stood before it
    const keys = new Set([...prev.keys(), ...this.changes.keys()]);
    const batch: Snapshot[] = [...keys].map((key) => ({ key, before: prev.get(key), after: this.changes.get(key) }));
    this.undoStack.push(batch);
    this.redoStack.length = 0;
    this.emit();
    return true;
  }

  /**
   * IMAGE SWAP: a dropped file previews via an object URL and lands in the
   * report as an instruction naming the file, because the editor cannot upload
   * anything anywhere; the human applying the report places the real asset.
   */
  setImage(el: HTMLImageElement, file: File) {
    this.ensureLive();
    const path = domPath(el);
    const key = `${path}|image`;
    const before = this.changes.get(key);
    const base = before ? before.base : el.currentSrc || el.src;
    const url = URL.createObjectURL(file);
    const old = this.imgUrls.get(key);
    if (old) URL.revokeObjectURL(old);
    this.imgUrls.set(key, url);
    el.srcset = "";
    el.src = url;
    const d = describe(el);
    const next: Change = { key, path, label: d.label, file: d.file, selector: d.selector, prop: "image", base, value: `replace with dropped file "${file.name}"`, vw: edWin().innerWidth, ...runtimeRef(el) };
    this.changes.set(key, next);
    this.commit([{ key, before, after: next }]);
  }

  /* ------------------------------------------------------------------ write */

  /**
   * Write one property on one element. `batch` groups several writes into a
   * single undo step, which is what makes dragging five selected elements feel
   * like one action rather than five.
   */
  set(el: HTMLElement, prop: NumProp, value: number, batch?: Snapshot[], opts?: { comp?: boolean }) {
    this.ensureLive();
    const spec = PROPS[prop];
    const max = "max" in spec ? (spec.max as number) : Infinity;
    const v = Math.min(max, Math.max(spec.min, round(value, spec.step)));
    const path = domPath(el);
    const bucket = bucketOf();
    const state = this.state;
    const key = changeKey(path, prop, bucket, state);
    const before = this.changes.get(key);
    const base = before ? before.base : `${readProp(el, prop)}${spec.unit}`;

    const d = describeFor(el, prop);
    const next: Change = {
      key,
      path,
      label: d.label,
      file: d.file,
      selector: d.selector,
      prop,
      base,
      value: `${v}${spec.unit}`,
      vw: edWin().innerWidth,
      bucket,
      state: state || undefined,
      rival: cascadeRival(el, prop, d.selector) ?? undefined,
      tok: tokenFor(prop, v, this.tokens()) ?? undefined,
      comp: opts?.comp,
      ...runtimeRef(el),
    };

    // no inline write: the preview stylesheet is the only carrier, scoped to
    // this bucket's media query, so no other viewport ever sees the value
    if (next.value === base) this.changes.delete(key);
    else this.changes.set(key, next);
    this.syncSheet();

    const snap: Snapshot = { key, before, after: this.changes.get(key) };
    if (batch) batch.push(snap);
    else this.commit([snap]);
    return v;
  }

  /**
   * Write any non-numeric property: a colour, an enum, a shadow. Same recording
   * and undo path as the numeric setter, so a font change and a drag land in one
   * history and one report.
   */
  setStyle(el: HTMLElement, prop: string, value: string, batch?: Snapshot[]) {
    this.ensureLive();
    const css = cssKeyOf(prop);
    if (!css) return;
    const path = domPath(el);
    const bucket = bucketOf();
    const state = this.state;
    const key = changeKey(path, prop, bucket, state);
    const before = this.changes.get(key);
    // numeric PROPS can also arrive here carrying a raw unit ("10vw"); their
    // base must come off the computed style, which readStyle does not cover
    const base = before
      ? before.base
      : prop in STYLE_PROPS
        ? readStyle(el, prop)
        : `${readProp(el, prop as NumProp)}${PROPS[prop as NumProp]?.unit ?? ""}`;
    const d = describeFor(el, prop);
    const next: Change = {
      key, path, label: d.label, file: d.file, selector: d.selector, prop, base, value,
      vw: edWin().innerWidth, bucket, state: state || undefined,
      rival: cascadeRival(el, prop, d.selector) ?? undefined,
      ...runtimeRef(el),
    };

    if (value === base) this.changes.delete(key);
    else this.changes.set(key, next);
    this.syncSheet();

    const snap: Snapshot = { key, before, after: this.changes.get(key) };
    if (batch) batch.push(snap);
    else this.commit([snap]);
  }

  /**
   * `original` is the text BEFORE the user started typing, captured by the
   * caller at edit start. It cannot be read here: by the time the edit commits,
   * el.textContent already holds the new copy, and recording that as the base
   * made undo restore the edit onto itself.
   */
  setText(el: HTMLElement, text: string, original: string, htmlOriginal?: string) {
    const path = domPath(el);
    const key = `${path}|text`;
    const before = this.changes.get(key);
    const base = before ? before.base : original;
    const d = describe(el);
    // markup travels with the change: undo and restore write innerHTML when it
    // exists, so an <em> inside an edited headline survives the round trip
    const next: Change = { key, path, label: d.label, file: d.file, selector: d.selector, prop: "text", base, value: text, baseHtml: before ? before.baseHtml : htmlOriginal, valueHtml: el.innerHTML, ...runtimeRef(el) };
    if (text === base) this.changes.delete(key);
    else this.changes.set(key, next);
    this.commit([{ key, before, after: this.changes.get(key) }]);
  }

  /**
   * A design NOTE pinned to an element: no CSS effect, but it rides the same
   * undo history, persistence and report as every real change, because half of
   * what needs saying about a layout is intent, not a value.
   */
  setNote(el: HTMLElement, text: string, mark?: string) {
    const path = domPath(el);
    const key = `${path}|note`;
    const before = this.changes.get(key);
    const d = describe(el);
    const next: Change = { key, path, label: d.label, file: d.file, selector: d.selector, prop: "note", base: "", value: text, vw: edWin().innerWidth, mark, ...runtimeRef(el) };
    if (!text.trim()) this.changes.delete(key);
    else this.changes.set(key, next);
    this.commit([{ key, before, after: this.changes.get(key) }]);
  }

  setOrder(labels: string[], container?: HTMLElement) {
    const key = container ? `${domPath(container)}|order` : "page|order";
    const before = this.changes.get(key);
    const d = container ? describe(container) : null;
    const next: Change = {
      key,
      path: container ? domPath(container) : "page",
      label: container ? `children of ${d!.label}` : "page section order",
      file: d?.file ?? null,
      selector: d?.selector ?? "PAGE_ORDER",
      prop: "order",
      base: before?.base ?? "",
      value: labels.join("\n"),
    };
    void before;
    // Deliberately NOT on the undo stack: cmd+Z cannot move sections back (the
    // reorder is a DOM move React does not know about, and a refresh is the
    // honest reset), so recording it as undoable would make the history lie.
    this.changes.set(key, next);
    this.emit();
  }

  /**
   * Write styles for a LIVE drag frame: apply to the DOM and update the change
   * map so the panel tracks, but no undo entry and no storage write. The drag
   * calls commitDrag() once on pointerup with the values it started from, which
   * becomes the single undo step for the whole gesture.
   */
  writeLive(el: HTMLElement, prop: NumProp, value: number) {
    this.ensureLive();
    const spec = PROPS[prop];
    const max = "max" in spec ? (spec.max as number) : Infinity;
    const v = Math.min(max, Math.max(spec.min, round(value, spec.step)));
    const path = domPath(el);
    const bucket = bucketOf();
    const state = this.state;
    const key = changeKey(path, prop, bucket, state);
    const before = this.changes.get(key);
    const base = before ? before.base : `${readProp(el, prop)}${spec.unit}`;
    const d = describeFor(el, prop);
    const value2 = `${v}${spec.unit}`;
    if (value2 === base) this.changes.delete(key);
    else
      this.changes.set(key, {
        key, path, label: d.label, file: d.file, selector: d.selector, prop, base, value: value2,
        vw: edWin().innerWidth, bucket, state: state || undefined,
        rival: cascadeRival(el, prop, d.selector) ?? undefined,
        tok: tokenFor(prop, v, this.tokens()) ?? undefined,
        ...runtimeRef(el),
      });
    this.syncSheet();
    this.dirty = true;
    this.listeners.forEach((fn) => fn());
  }

  /** the writeLive twin for string-valued props (translate during solo drags) */
  writeLiveRaw(el: HTMLElement, prop: string, value: string) {
    this.ensureLive();
    if (!cssKeyOf(prop)) return;
    const path = domPath(el);
    const bucket = bucketOf();
    const state = this.state;
    const key = changeKey(path, prop, bucket, state);
    const before = this.changes.get(key);
    const base = before
      ? before.base
      : prop in STYLE_PROPS
        ? readStyle(el, prop)
        : `${readProp(el, prop as NumProp)}${PROPS[prop as NumProp]?.unit ?? ""}`;
    const d = describeFor(el, prop);
    if (value === base) this.changes.delete(key);
    else
      this.changes.set(key, {
        key, path, label: d.label, file: d.file, selector: d.selector, prop, base, value,
        vw: edWin().innerWidth, bucket, state: state || undefined,
        rival: cascadeRival(el, prop, d.selector) ?? undefined,
        ...runtimeRef(el),
      });
    this.syncSheet();
    this.dirty = true;
    this.listeners.forEach((fn) => fn());
  }

  /**
   * Close a drag as ONE undo step: `starts` is each (el, prop)'s change entry
   * as it stood before the gesture began, captured by the drag on pointerdown.
   */
  commitDrag(starts: Array<{ key: string; before: Change | undefined }>) {
    const batch: Snapshot[] = starts
      .map(({ key, before }) => ({ key, before, after: this.changes.get(key) }))
      .filter((s) => s.before?.value !== s.after?.value);
    if (batch.length) this.commit(batch);
    else this.save();
  }

  /** close a batch opened by passing an array to set() */
  commit(batch: Snapshot[]) {
    if (!batch.length) return;
    this.undoStack.push(batch);
    this.redoStack.length = 0;
    this.emit();
  }

  /* ------------------------------------------------------------- undo / redo */

  /**
   * Apply one side of a snapshot. Styles can fall back to "" (the stylesheet
   * takes over again), but TEXT has no stylesheet to fall back to: the original
   * copy exists only in the recorded base, so the snapshot itself must travel
   * here. The old signature passed only the target Change, which made undoing a
   * first text edit a silent no-op.
   */
  private restore(snap: Snapshot, dir: "undo" | "redo") {
    const c = dir === "undo" ? snap.before : snap.after;
    const key = snap.key;
    if (c) this.changes.set(key, c);
    else this.changes.delete(key);
    const ref = snap.after ?? snap.before;
    const path = ref?.path ?? key.split("|")[0];
    const prop = (ref?.prop ?? key.split("|")[1]) as ChangeProp;
    if (path === "page" || prop === "note") return;
    if (ref?.bucket) {
      // a bucketed style change: the map is already updated by the caller
      // pattern below, so recompiling the sheet IS the DOM write
      this.syncSheet();
      return;
    }
    const el = ref ? resolveTarget(ref) : fromDomPath(path);
    if (!el) return;
    if (prop === "text") {
      if (c) {
        if (c.valueHtml != null) el.innerHTML = c.valueHtml;
        else el.textContent = c.value;
      } else {
        const src = snap.before ?? snap.after;
        if (src?.baseHtml != null) el.innerHTML = src.baseHtml;
        else el.textContent = src?.base ?? el.textContent ?? "";
      }
      return;
    }
    if (prop === "image") {
      const base = snap.before?.base ?? snap.after?.base;
      const url = this.imgUrls.get(key);
      (el as HTMLImageElement).src = c ? (url ?? c.base) : (base ?? (el as HTMLImageElement).src);
      return;
    }
    if (!cssKeyOf(prop)) return;
    el.style.setProperty(prop, c ? c.value : "");
    void c;
  }

  undo() {
    const batch = this.undoStack.pop();
    if (!batch) return;
    // reverse order, so overlapping writes unwind exactly as they were made
    [...batch].reverse().forEach((s) => this.restore(s, "undo"));
    this.redoStack.push(batch);
    this.emit();
  }

  redo() {
    const batch = this.redoStack.pop();
    if (!batch) return;
    batch.forEach((s) => this.restore(s, "redo"));
    this.undoStack.push(batch);
    this.emit();
  }

  resetOne(key: string) {
    const before = this.changes.get(key);
    const snap: Snapshot = { key, before, after: undefined };
    this.restore(snap, "redo");
    this.undoStack.push([snap]);
    this.redoStack.length = 0;
    this.emit();
  }

  resetAll() {
    const batch: Snapshot[] = [...this.changes.entries()].map(([key, before]) => ({
      key,
      before,
      after: undefined,
    }));
    batch.forEach((s) => this.restore(s, "redo"));
    this.syncSheet();
    this.undoStack.push(batch);
    this.redoStack.length = 0;
    this.emit();
  }

  /* ----------------------------------------------------------- persistence */

  private save() {
    try {
      const payload = [...this.changes.values()].filter((c) => c.prop !== "order" && c.prop !== "image");
      if (payload.length) sessionStorage.setItem(STORAGE + location.pathname, JSON.stringify(payload));
      else sessionStorage.removeItem(STORAGE + location.pathname);
    } catch {
      /* storage disabled: the editor still works, it just will not survive a reload */
    }
  }

  /**
   * Re-apply stored changes after a hot reload. Section ORDER is deliberately not
   * persisted: it is a DOM move React does not know about, and replaying it
   * against a fresh tree would fight the framework.
   */
  restoreFromStorage() {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(STORAGE + location.pathname);
    } catch {
      return 0;
    }
    if (!raw) return 0;
    let saved: Change[];
    try {
      saved = JSON.parse(raw);
    } catch {
      return 0;
    }
    let applied = 0;
    for (const c of saved) {
      if (c.prop === "text") {
        const el = resolveTarget(c);
        if (!el) continue;
        if (c.valueHtml != null) el.innerHTML = c.valueHtml;
        else el.textContent = c.value;
      }
      this.changes.set(c.key, c);
      applied += 1;
    }
    this.syncSheet();
    this.dirty = true;
    this.listeners.forEach((fn) => fn());
    return applied;
  }

  /* --------------------------------------------------------------- exports */

  /** the report pasted back into Claude: file, rule, property, old and new */
  report() {
    const all = this.getSnapshot();
    const spacing = all.filter((c) => c.prop !== "text" && c.prop !== "order" && c.prop !== "note" && c.prop !== "image");
    const images = all.filter((c) => c.prop === "image");
    const text = all.filter((c) => c.prop === "text");
    const notes = all.filter((c) => c.prop === "note");
    const orders = all.filter((c) => c.prop === "order");

    const tw = looksTailwind();
    const lines = [
      `PAVEL EDITOR REPORT   ${location.pathname}   viewport ${edWin().innerWidth}x${edWin().innerHeight}`,
      tw
        ? "This page looks like Tailwind, so every style change also carries the class that expresses it. Prefer the classes; verify the breakpoint prefixes against the project's own `screens` config."
        : "",
      "",
    ].filter((l, i) => l !== "" || i > 0);

    // Every band is reported separately, named by the media query it means: a
    // value chosen at 768px is a tablet decision and must not touch the base
    // rule, and a value chosen at 390px must not touch the tablet either.
    const emit = (title: string, list: Change[]) => {
      if (!list.length) return;
      const byFile = new Map<string, Change[]>();
      for (const c of list) {
        const f = c.file ?? "(global css)";
        byFile.set(f, [...(byFile.get(f) ?? []), c]);
      }
      lines.push(title);
      for (const [file, group] of byFile) {
        lines.push(`  ${file}`);
        // one rule block per (selector, STATE). Grouping by selector alone put a
        // hover value and a resting value of the same property in one block,
        // where the de-duplication kept one and called the other a conflict.
        const bySel = new Map<string, Change[]>();
        for (const c of group) {
          const k = `${c.selector}|${c.state ?? ""}`;
          bySel.set(k, [...(bySel.get(k) ?? []), c]);
        }
        for (const [k, props] of bySel) {
          const sel = k.slice(0, k.lastIndexOf("|"));
          const state = k.slice(k.lastIndexOf("|") + 1);
          // on a Tailwind page the "rule" is a utility class shared by the whole
          // site. Editing it is the wrong move every time, and saying so beats
          // hoping the applier notices.
          const utility = tw && /^\.(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|space|text|font|leading|tracking|rounded|w|h|min-w|max-w|bg|border|shadow|flex|grid|items|justify|self|order|opacity|z)-/.test(sel);
          lines.push(
            `    ${sel}${state ? `:${state}` : ""} {${utility ? "   /* UTILITY CLASS, shared site-wide: do NOT edit this rule. Change the element's classes to the tailwind values below. */" : ""}`,
          );
          // several elements can share one rule with different end values; a
          // rule block with contradictory duplicates is not appliable, so keep
          // the last value per property and say a conflict happened
          const byProp = new Map<string, Change[]>();
          for (const c of props) byProp.set(String(c.prop), [...(byProp.get(String(c.prop)) ?? []), c]);
          for (const [, list] of byProp) {
            const c = list[list.length - 1];
            const conflict = new Set(list.map((x) => x.value)).size > 1;
            // px is what direct manipulation measures; the applier picks the
            // codebase's own units, so size props carry the vw equivalent
            const pxv = /^-?\d+(\.\d+)?px$/.test(c.value) ? parseFloat(c.value) : null;
            const sizeProp = ["width", "max-width", "height", "font-size"].includes(String(c.prop));
            const twClass = tw ? tailwindFor(String(c.prop), c.value, c.bucket, c.state) : null;
            const tags = [
              `was ${c.base}`,
              c.tok ? `THIS EQUALS THE TOKEN var(${c.tok}) — write the token, not the number` : "",
              twClass ? `tailwind: ${twClass}` : "",
              pxv !== null && sizeProp && c.vw ? `≈ ${((pxv / c.vw) * 100).toFixed(1)}vw at the stated viewport` : "",
              c.comp ? "isolate-move pair: keeps everything below in place, apply together with the margin-top above" : "",
              conflict ? `CONFLICT: ${list.length} elements set different values, last one shown` : "",
              c.rival
                ? `CASCADE: "${c.rival}" already sets this and is at least as specific. The editor's preview only held because it writes !important; this rule as written will LOSE. Put the value on that rule, or make this selector more specific. Do not paper over it with !important.`
                : "",
            ].filter(Boolean);
            lines.push(`      ${c.prop}: ${c.value};   /* ${tags.join(" · ")} */`);
          }
          lines.push("    }");
        }
      }
      lines.push("");
    };

    // widest band first: the base rule, then each override in cascade order
    const bands = [...new Set(spacing.map((c) => c.bucket ?? "d"))].sort((a, b) => bucketOrder(a) - bucketOrder(b));
    for (const band of bands) {
      const list = spacing.filter((c) => (c.bucket ?? "d") === band);
      const media = mediaFor(band);
      const heading =
        media === "all"
          ? "STYLE CHANGES"
          : `STYLE CHANGES MADE AT ${bucketLabel(band).toUpperCase()} — these belong inside @media ${media} and must NOT touch the base rule`;
      emit(heading, list);
    }

    if (text.length) {
      lines.push("COPY CHANGES (governed: these need the provenance check)");
      for (const c of text) {
        lines.push(`  ${c.label}`);
        lines.push(`    was: ${c.base}`);
        lines.push(`    now: ${c.value}`);
      }
      lines.push("");
    }

    if (images.length) {
      lines.push("IMAGE SWAPS (the dropped files live on the designer's machine; get them and place the assets)");
      for (const c of images) lines.push(`  ${c.label}: ${c.value}   /* was ${c.base} */`);
      lines.push("");
    }

    if (notes.length) {
      lines.push("NOTES (design intent, no CSS attached; act on these too)");
      for (const c of notes) lines.push(`  ${c.label}: ${c.value}`);
      lines.push("");
    }

    for (const order of orders) {
      lines.push(`REORDER · ${order.label} (change the markup/JSX order to match)`);
      order.value.split("\n").forEach((n, i) => lines.push(`  ${i + 1}. ${n}`));
      lines.push("");
    }

    if (!spacing.length && !text.length && !notes.length && !images.length && !orders.length) lines.push("(nothing changed yet)");
    return lines.join("\n");
  }
}

export const store = new EditStore();
