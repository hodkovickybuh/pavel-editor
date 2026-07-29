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
  describe,
  domPath,
  fromDomPath,
  readProp,
  readStyle,
  round,
  runtimeRef,
} from "./selectors";
import { edWin, isElem } from "./context";

export type ChangeProp = NumProp | string;

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
};

/**
 * Find a change's element in the CURRENT realm. The runtime selector goes
 * first: it survives the desktop/frame DOM differences that shift nth-child
 * paths. The path is the fallback for elements no module class reaches.
 */
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

  /** true while the page is showing ORIGINALS with all edits suspended */
  previewOff = false;
  /** runtime-only object URLs for dropped images, keyed like changes */
  private imgUrls = new Map<string, string>();

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
      if (c.prop === "order" || c.prop === "note") continue;
      const el = resolveTarget(c);
      if (!el) continue;
      if (c.prop === "text") el.textContent = this.previewOff ? c.base : c.value;
      else if (c.prop === "image") {
        const url = this.imgUrls.get(c.key);
        (el as HTMLImageElement).src = this.previewOff ? c.base : (url ?? c.base);
      } else el.style.setProperty(String(c.prop), this.previewOff ? "" : c.value);
    }
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

  loadVariant(slot: "A" | "B") {
    let saved: Change[];
    try {
      const raw = sessionStorage.getItem(`pe-variant-${slot}`);
      if (!raw) return false;
      saved = JSON.parse(raw);
    } catch {
      return false;
    }
    this.ensureLive();
    // clear the current state back to originals, then replay the variant
    for (const c of this.changes.values()) {
      const el = resolveTarget(c);
      if (!el || c.prop === "order" || c.prop === "note") continue;
      if (c.prop === "text") el.textContent = c.base;
      else if (c.prop !== "image") el.style.setProperty(String(c.prop), "");
    }
    this.changes.clear();
    for (const c of saved) {
      const el = resolveTarget(c);
      if (el) {
        if (c.prop === "text") el.textContent = c.value;
        else if (c.prop !== "note" && c.prop !== "order") el.style.setProperty(String(c.prop), c.value);
      }
      this.changes.set(c.key, c);
    }
    this.undoStack.length = 0;
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
    const key = `${path}|${prop}`;
    const before = this.changes.get(key);
    const base = before ? before.base : `${readProp(el, prop)}${spec.unit}`;

    const d = describe(el);
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
      comp: opts?.comp,
      ...runtimeRef(el),
    };

    // Written through setProperty with the kebab name, which both property
    // tables use as their keys. When the value lands back ON its base, the
    // inline style is CLEARED rather than written: leaving `margin-top: 24px`
    // inline when 24px is also the stylesheet value looks harmless here but
    // overrides that element's media queries at every other viewport, with no
    // change entry left to ever remove it.
    el.style.setProperty(prop, next.value === base ? "" : next.value);

    if (next.value === base) this.changes.delete(key);
    else this.changes.set(key, next);

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
    const key = `${path}|${prop}`;
    const before = this.changes.get(key);
    // numeric PROPS can also arrive here carrying a raw unit ("10vw"); their
    // base must come off the computed style, which readStyle does not cover
    const base = before
      ? before.base
      : prop in STYLE_PROPS
        ? readStyle(el, prop)
        : `${readProp(el, prop as NumProp)}${PROPS[prop as NumProp]?.unit ?? ""}`;
    const d = describe(el);
    const next: Change = { key, path, label: d.label, file: d.file, selector: d.selector, prop, base, value, vw: edWin().innerWidth, ...runtimeRef(el) };

    el.style.setProperty(prop, value === base ? "" : value);

    if (value === base) this.changes.delete(key);
    else this.changes.set(key, next);

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
  setText(el: HTMLElement, text: string, original: string) {
    const path = domPath(el);
    const key = `${path}|text`;
    const before = this.changes.get(key);
    const base = before ? before.base : original;
    const d = describe(el);
    const next: Change = { key, path, label: d.label, file: d.file, selector: d.selector, prop: "text", base, value: text, ...runtimeRef(el) };
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

  setOrder(labels: string[]) {
    const key = "page|order";
    const before = this.changes.get(key);
    const next: Change = {
      key,
      path: "page",
      label: "page section order",
      file: "app/components/landing-v2/HomeV2.tsx",
      selector: "PAGE_ORDER",
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
    const key = `${path}|${prop}`;
    const before = this.changes.get(key);
    const base = before ? before.base : `${readProp(el, prop)}${spec.unit}`;
    const d = describe(el);
    const value2 = `${v}${spec.unit}`;
    el.style.setProperty(prop, value2 === base ? "" : value2);
    if (value2 === base) this.changes.delete(key);
    else
      this.changes.set(key, {
        key, path, label: d.label, file: d.file, selector: d.selector, prop, base, value: value2, vw: edWin().innerWidth, ...runtimeRef(el),
      });
    this.dirty = true;
    this.listeners.forEach((fn) => fn());
  }

  /** the writeLive twin for string-valued props (translate during solo drags) */
  writeLiveRaw(el: HTMLElement, prop: string, value: string) {
    this.ensureLive();
    if (!cssKeyOf(prop)) return;
    const path = domPath(el);
    const key = `${path}|${prop}`;
    const before = this.changes.get(key);
    const base = before
      ? before.base
      : prop in STYLE_PROPS
        ? readStyle(el, prop)
        : `${readProp(el, prop as NumProp)}${PROPS[prop as NumProp]?.unit ?? ""}`;
    const d = describe(el);
    el.style.setProperty(prop, value === base ? "" : value);
    if (value === base) this.changes.delete(key);
    else this.changes.set(key, { key, path, label: d.label, file: d.file, selector: d.selector, prop, base, value, vw: edWin().innerWidth, ...runtimeRef(el) });
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
    const path = key.split("|")[0];
    const prop = key.split("|").slice(1).join("|") as ChangeProp;
    if (path === "page" || prop === "note") return;
    const ref = snap.after ?? snap.before;
    const el = ref ? resolveTarget(ref) : fromDomPath(path);
    if (!el) return;
    if (prop === "text") {
      const original = snap.before?.base ?? snap.after?.base;
      el.textContent = c ? c.value : (original ?? el.textContent ?? "");
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
      const el = resolveTarget(c);
      if (!el) continue;
      if (c.prop === "text") el.textContent = c.value;
      else if (c.prop !== "note") {
        const css = cssKeyOf(c.prop);
        if (!css) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (el.style as any)[css] = c.value;
      }
      this.changes.set(c.key, c);
      applied += 1;
    }
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
    const order = all.find((c) => c.prop === "order");

    const lines = [
      `PAVEL EDITOR REPORT   ${location.pathname}   viewport ${edWin().innerWidth}x${edWin().innerHeight}`,
      "",
    ];

    // Changes made in a narrow frame are reported separately: a value chosen at
    // 390px wide is a phone decision and belongs in the phone media query, not
    // in the base rule where it would restyle desktop too.
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
        const bySel = new Map<string, Change[]>();
        for (const c of group) bySel.set(c.selector, [...(bySel.get(c.selector) ?? []), c]);
        for (const [sel, props] of bySel) {
          lines.push(`    ${sel} {`);
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
            const tags = [
              `was ${c.base}`,
              pxv !== null && sizeProp && c.vw ? `≈ ${((pxv / c.vw) * 100).toFixed(1)}vw at the stated viewport` : "",
              c.comp ? "isolate-move pair: keeps everything below in place, apply together with the margin-top above" : "",
              conflict ? `CONFLICT: ${list.length} elements set different values, last one shown` : "",
            ].filter(Boolean);
            lines.push(`      ${c.prop}: ${c.value};   /* ${tags.join(" · ")} */`);
          }
          lines.push("    }");
        }
      }
      lines.push("");
    };
    emit("STYLE CHANGES (desktop viewport)", spacing.filter((c) => (c.vw ?? 1440) > 900));
    emit(
      "STYLE CHANGES MADE AT A NARROW VIEWPORT (scope these in the phone media query, do not touch the base rule)",
      spacing.filter((c) => (c.vw ?? 1440) <= 900),
    );

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

    if (order) {
      lines.push("SECTION ORDER (reorder the JSX in HomeV2.tsx to match)");
      order.value.split("\n").forEach((n, i) => lines.push(`  ${i + 1}. ${n}`));
      lines.push("");
    }

    if (!spacing.length && !text.length && !notes.length && !images.length && !order) lines.push("(nothing changed yet)");
    return lines.join("\n");
  }
}

export const store = new EditStore();
