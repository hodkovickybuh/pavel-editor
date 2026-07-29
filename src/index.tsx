"use client";

/**
 * PAVEL EDITOR — direct manipulation of any live page, so layout can be judged
 * by moving it rather than by guessing a number, editing CSS, rebuilding and
 * looking again. Framework-agnostic: it ships as one self-contained script that
 * mounts itself into whatever page it is loaded on.
 *
 * The interaction model is Figma's, adapted to the one way a web page is not a
 * canvas: these elements are in FLOW, so nothing has a free position.
 *
 *   click            select            shift+click     add / remove
 *   click empty      deselect          drag empty      marquee
 *   drag selected    move              double-click    drill into the group
 *   alt + hover      measure           ←→              walk the tree
 *   arrows           nudge 1px         shift+arrows    10px
 *   cmd+Z / +shift   undo / redo       cmd+C / cmd+V   copy / paste style
 *   enter            edit the text     N               pin a note
 *   S C G            spacing bands, centring, 8px grid
 *   P                push/isolate      D / backspace   duplicate / hide
 *
 * MOVE MODES, the one concept with no Figma equivalent:
 *   push     writes margin-top. Honest CSS: the element moves and everything
 *            below it moves too. This is what the stylesheet will really do.
 *   isolate  moves the element ALONE, by taking the same amount off its own
 *            margin-bottom, so its total height is unchanged and nothing below
 *            shifts.
 *
 * THE DEVICE FRAME: the viewport emulator swaps the edit target to a same-origin
 * iframe (see Frame.tsx and context.ts). The panel, store and undo history stay
 * in the parent; only the canvas changes. Every DOM touch in this file goes
 * through edWin()/edDoc() so the switch is one function call.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { csOf, edDoc, edWin, isElem, setEditTarget } from "./context";
import {
  type NumProp,
  fromDomPath,
  isEditable,
  matchingElements,
  nearestBlock,
  readProp,
  readStyle,
  sectionLabel,
  sectionWrap,
} from "./selectors";
import {
  type Box,
  type Guide,
  type Span,
  boxFrom,
  marqueeCandidates,
  marqueeHits,
  measure,
  rectOf,
  snapVertical,
  verticalGaps,
} from "./geometry";
import { store, type Change } from "./store";
import { VERSION } from "./version";
import { Overlay } from "./Overlay";
import { Panel, type MoveMode, type Tab } from "./Panel";
import { Frame, type FrameSpec } from "./Frame";
import { UI } from "./theme";
import { EDITOR_CSS } from "./styles";

type DragStart = { key: string; before: Change | undefined };

type Drag =
  | {
      kind: "marquee";
      startX: number;
      startY: number;
      /** measured lazily on the first past-threshold move: collecting ~2000
          rects on every plain click was the single biggest click-latency cost */
      cands: ReturnType<typeof marqueeCandidates> | null;
      clicked: HTMLElement | null;
      moved: boolean;
    }
  | {
      kind: "move";
      startX: number;
      startY: number;
      els: HTMLElement[];
      topBases: number[];
      bottomBases: number[];
      leftBases: number[];
      rightBases: number[];
      trBases: Array<[number, number]>;
      rect: DOMRect;
      peers: DOMRect[];
      moved: boolean;
      /** each touched (el, prop)'s change entry before the gesture, so pointerup
          can commit the WHOLE drag as one undo step */
      starts: DragStart[];
    }
  | { kind: "reorder"; el: HTMLElement; parent: HTMLElement; startIdx: number; moved: boolean }
  | {
      kind: "resize";
      el: HTMLElement;
      edge: "e" | "s" | "se";
      startX: number;
      startY: number;
      baseW: number;
      baseH: number;
      starts: DragStart[];
      moved: boolean;
    }
  | { kind: "section"; el: HTMLElement; startY: number }
  | { kind: "mark"; points: Array<[number, number]>; startEl: HTMLElement | null };

/** the props cmd+C captures: the visual identity of an element, not its layout */
const CLIP_NUMERIC: NumProp[] = [
  "padding-top", "padding-bottom", "padding-left", "padding-right",
  "font-size", "line-height", "letter-spacing", "border-radius", "opacity",
];
const CLIP_STYLE = [
  "color", "background-color", "font-family", "font-weight", "text-transform", "box-shadow",
];

export function EditMode({ standalone = false }: { standalone?: boolean }) {
  /** armed = the editor was loaded deliberately; on = currently active.
      Keeping them apart is what makes "off" reversible instead of a dead end. */
  const [armed, setArmed] = useState(false);
  const [on, setOn] = useState(false);
  const [mode, setMode] = useState<"spacing" | "sections" | "mark">("spacing");
  const [tab, setTab] = useState<Tab>("design");
  const [moveMode, setMoveMode] = useState<MoveMode>("isolate");
  const [selection, setSelectionState] = useState<HTMLElement[]>([]);
  const [hover, setHover] = useState<HTMLElement | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [spans, setSpans] = useState<Span[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showSpacing, setShowSpacing] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showCentring, setShowCentring] = useState(true);
  const [scopeAll, setScopeAll] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [updateTo, setUpdateTo] = useState<string | null>(null);
  const [showingOriginal, setShowingOriginal] = useState(false);
  const [variantSaved, setVariantSaved] = useState<{ A: boolean; B: boolean }>({
    A: store.hasVariant("A"),
    B: store.hasVariant("B"),
  });
  const [activeVariant, setActiveVariant] = useState<"A" | "B" | null>(null);
  const [noteDraft, setNoteDraft] = useState<{ el: HTMLElement; text: string; mark?: string } | null>(null);
  /** the stroke being drawn right now, as an SVG points string */
  const [liveStroke, setLiveStroke] = useState<string | null>(null);
  /** the device frame, and the realm handle once its document is ready */
  const [frameSpec, setFrameSpec] = useState<FrameSpec | null>(null);
  const [frameRealm, setFrameRealm] = useState<{ win: Window; doc: Document } | null>(null);
  /** forces overlay + panel to re-measure: scroll, resize, each drag frame */
  const [tick, setTick] = useState(0);
  /** bumps when the edit target changes realm, so listeners re-bind */
  const [realmTick, setRealmTick] = useState(0);

  const changes = useSyncExternalStore(store.subscribe, store.getSnapshot, () => store.getSnapshot());

  // long-lived capture-phase listeners are bound per realm, so they read the
  // current values through refs rather than a stale closure
  const selRef = useRef<HTMLElement[]>([]);
  const drag = useRef<Drag | null>(null);
  const modeRef = useRef<"spacing" | "sections" | "mark">(mode);
  const moveModeRef = useRef(moveMode);
  const editingText = useRef<HTMLElement | null>(null);
  const styleClip = useRef<{ nums: Partial<Record<NumProp, number>>; strs: Record<string, string> } | null>(null);
  const toastTimer = useRef(0);
  const linkHint = useRef(false);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    moveModeRef.current = moveMode;
  }, [moveMode]);

  const setSelection = useCallback((els: HTMLElement[]) => {
    selRef.current = els;
    setSelectionState(els);
  }, []);

  const flash = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }, []);

  const bump = useCallback(() => setTick((t) => t + 1), []);

  // the editor's own stylesheet, injected once and scoped to [data-editmode-ui]
  useEffect(() => {
    if (document.getElementById("pavel-editor-css")) return;
    const tag = document.createElement("style");
    tag.id = "pavel-editor-css";
    tag.textContent = EDITOR_CSS;
    document.head.appendChild(tag);
  }, []);

  /* ------------------------------------------------------------------ arm */

  useEffect(() => {
    // standalone (the injected script) arms on load: loading it IS the intent.
    // As an in-repo dev component it stays inert until the URL carries ?edit=1.
    const q = new URLSearchParams(window.location.search);
    if (q.has("pe-frame") || window.name === "pavel-editor-frame") return;
    if (standalone || q.has("edit")) {
      setArmed(true);
      setOn(true);
    }
  }, [standalone]);

  // once per session, ask jsDelivr's data API for the newest release tag and
  // offer the zip when this copy is older; sideloaded copies (friends with the
  // zip) have no other update channel at all
  useEffect(() => {
    if (!on) return;
    fetch("https://data.jsdelivr.com/v1/package/gh/hodkovickybuh/pavel-editor")
      .then((r) => r.json())
      .then((j: { versions?: string[] }) => {
        const latest = j.versions?.[0];
        if (!latest) return;
        const num = (v: string) => v.split(".").map(Number);
        const [a1, a2, a3] = num(latest);
        const [b1, b2, b3] = num(VERSION);
        if (a1 > b1 || (a1 === b1 && (a2 > b2 || (a2 === b2 && a3 > b3)))) setUpdateTo(latest);
      })
      .catch(() => {
        /* offline or blocked: no banner */
      });
  }, [on]);

  // re-apply anything from before the last hot reload; the dev server rebuilds
  // on every save and would otherwise wipe a session of work. Re-applied on a
  // few timers because a single pass lands mid-hydration and React drops the
  // inline styles again on the way through; the restore is idempotent.
  useEffect(() => {
    if (!on) return;
    const n = store.restoreFromStorage();
    const timers = [200, 800, 2000].map((ms) => window.setTimeout(() => store.restoreFromStorage(), ms));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring persisted work is inherently a mount-time side effect
    if (n) flash(`restored ${n} change${n > 1 ? "s" : ""} from before the reload`);
    return () => timers.forEach(clearTimeout);
  }, [on, flash]);

  // outlines are drawn from live rects, so scroll and resize in the TARGET
  // realm repaint the overlay; scrolling the panel itself must not (that
  // repaint remounted the panel and reset its scroll, an every-frame bug)
  useEffect(() => {
    if (!on) return;
    const f = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t && typeof t.closest === "function" && t.closest("[data-editmode-ui]")) return;
      bump();
    };
    const w = edWin();
    w.addEventListener("scroll", f, { passive: true, capture: true });
    w.addEventListener("resize", f);
    return () => {
      w.removeEventListener("scroll", f, true);
      w.removeEventListener("resize", f);
    };
  }, [on, bump, realmTick]);

  // SELF-HEAL: when the HOST app re-renders (its own React state, a route
  // change), nodes are replaced and inline previews vanish. Watch the tree,
  // re-apply the session's changes to the new nodes, and prune dead selections.
  useEffect(() => {
    if (!on) return;
    let timer = 0;
    const obs = new MutationObserver((muts) => {
      if (muts.every((m) => (m.target as HTMLElement).closest?.("[data-editmode-ui]"))) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const alive = selRef.current.filter((el) => el.isConnected);
        if (alive.length !== selRef.current.length) {
          setSelection(alive);
          if (!alive.length) flash("the page re-rendered · selection released");
        }
        store.restoreFromStorage();
        bump();
      }, 400);
    });
    try {
      obs.observe(edDoc().body, { childList: true, subtree: true });
    } catch {
      /* realm gone */
    }
    return () => {
      window.clearTimeout(timer);
      obs.disconnect();
    };
  }, [on, realmTick, setSelection, flash, bump]);

  // the parent page must not scroll behind the device frame
  useEffect(() => {
    if (!frameSpec) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [frameSpec]);

  /* -------------------------------------------------------------- helpers */

  const root = useMemo(() => (on ? sectionWrap() : null), [on, tick, realmTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const sectionsOf = useCallback(() => {
    const w = sectionWrap();
    return w ? ([...w.children].filter(isElem) as HTMLElement[]) : [];
  }, []);

  const sectionOf = useCallback(
    (el: Element | null) => {
      const list = sectionsOf();
      let n: Element | null = el;
      while (n) {
        if (list.includes(n as HTMLElement)) return n as HTMLElement;
        n = n.parentElement;
      }
      return null;
    },
    [sectionsOf],
  );

  const pick = useCallback(
    (x: number, y: number, deep = false): HTMLElement | null => {
      const el = edDoc().elementFromPoint(x, y);
      if (!el || !isEditable(el)) return null;
      if (modeRef.current === "sections") return sectionOf(el);
      return deep ? el : nearestBlock(el);
    },
    [sectionOf],
  );

  /** scope-all expands each selected element to everything its rule styles */
  const targetsOf = useCallback(
    (els: HTMLElement[]) => {
      if (!scopeAll) return els;
      const out = new Set<HTMLElement>();
      els.forEach((el) => matchingElements(el).forEach((m) => out.add(m)));
      return [...out];
    },
    [scopeAll],
  );

  /* --------------------------------------------------------------- writes */

  const applyProp = useCallback(
    (prop: NumProp, value: number) => {
      const els = targetsOf(selRef.current);
      if (!els.length) return;
      const batch: Parameters<typeof store.commit>[0] = [];
      els.forEach((el) => store.set(el, prop, value, batch));
      store.commit(batch);
      bump();
    },
    [bump, targetsOf],
  );

  /** raw CSS value (10vw, 50%, 3rem) typed into a numeric field */
  const applyRaw = useCallback(
    (prop: string, value: string) => {
      const els = targetsOf(selRef.current);
      if (!els.length) return;
      const batch: Parameters<typeof store.commit>[0] = [];
      els.forEach((el) => store.setStyle(el, prop, value, batch));
      store.commit(batch);
      bump();
    },
    [bump, targetsOf],
  );

  const applyStyle = useCallback(
    (prop: string, value: string) => {
      const els = targetsOf(selRef.current);
      if (!els.length) return;
      const batch: Parameters<typeof store.commit>[0] = [];
      els.forEach((el) => store.setStyle(el, prop, value, batch));
      store.commit(batch);
      bump();
    },
    [bump, targetsOf],
  );

  const nudge = useCallback(
    (delta: number) => {
      const els = selRef.current;
      if (!els.length) return;
      const batch: Parameters<typeof store.commit>[0] = [];
      els.forEach((el) => {
        if (moveModeRef.current === "isolate") {
          const tr = csOf(el).translate;
          const parts = !tr || tr === "none" ? [0, 0] : tr.split(" ").map((v) => parseFloat(v) || 0);
          store.setStyle(el, "translate", `${Math.round(parts[0] ?? 0)}px ${Math.round((parts[1] ?? 0) + delta)}px`, batch);
        } else {
          store.set(el, "margin-top", readProp(el, "margin-top") + delta, batch);
        }
      });
      store.commit(batch);
      bump();
    },
    [bump],
  );

  const hideSelection = useCallback(() => {
    const els = selRef.current;
    if (!els.length) return;
    const batch: Parameters<typeof store.commit>[0] = [];
    els.forEach((el) => store.setStyle(el, "display", "none", batch));
    store.commit(batch);
    setSelection([]);
    flash("hidden · in the change list, cmd+Z brings it back");
    bump();
  }, [bump, flash, setSelection]);

  const copyStyle = useCallback(() => {
    const el = selRef.current[0];
    if (!el) return;
    const nums: Partial<Record<NumProp, number>> = {};
    CLIP_NUMERIC.forEach((p) => {
      nums[p] = readProp(el, p);
    });
    const strs: Record<string, string> = {};
    CLIP_STYLE.forEach((p) => {
      strs[p] = readStyle(el, p);
    });
    styleClip.current = { nums, strs };
    flash("style copied · cmd+V on another element");
  }, [flash]);

  const pasteStyle = useCallback(() => {
    const clip = styleClip.current;
    const els = targetsOf(selRef.current);
    if (!clip || !els.length) return;
    const batch: Parameters<typeof store.commit>[0] = [];
    els.forEach((el) => {
      (Object.entries(clip.nums) as Array<[NumProp, number]>).forEach(([p, v]) => {
        if (readProp(el, p) !== v) store.set(el, p, v, batch);
      });
      Object.entries(clip.strs).forEach(([p, v]) => {
        if (v && readStyle(el, p) !== v) store.setStyle(el, p, v, batch);
      });
    });
    store.commit(batch);
    bump();
    flash(`style pasted to ${els.length}`);
  }, [bump, flash, targetsOf]);

  /** inline text editing, entered by Enter on a selection or by double-click */
  const startTextEdit = useCallback(
    (el: HTMLElement) => {
      el.setAttribute("contenteditable", "plaintext-only");
      // Firefox below 135 does not know plaintext-only; fall back
      if (!el.isContentEditable) el.setAttribute("contenteditable", "true");
      el.focus();
      editingText.current = el;
      const before = el.textContent ?? "";
      const beforeHtml = el.innerHTML;
      const finish = () => {
        el.removeAttribute("contenteditable");
        editingText.current = null;
        if (el.innerHTML !== beforeHtml) {
          store.setText(el, el.textContent ?? "", before, beforeHtml);
          flash("text changed · it lands in the report as a copy change");
        }
        el.removeEventListener("blur", finish);
        bump();
      };
      el.addEventListener("blur", finish);
    },
    [flash, bump],
  );

  /* --------------------------------------------------------- interactions */

  useEffect(() => {
    if (!on) return;

    const endDrag = () => {
      const d = drag.current;
      drag.current = null;
      edDoc().body.style.cursor = "";
      setGuides([]);
      setNote(null);
      setMarquee(null);
      if (d?.kind === "section" || d?.kind === "reorder") d.el.style.opacity = "";
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // cmd+click is a NORMAL click: links follow, buttons fire, menus open.
      // The page stays usable while editing, the pro-tool convention.
      if (e.metaKey && !e.shiftKey && !e.altKey) return;
      if ((e.target as HTMLElement)?.closest?.("[data-editmode-ui]")) return;
      if (editingText.current) return; // let a text edit run to its own blur
      const el = pick(e.clientX, e.clientY);
      e.preventDefault();
      e.stopPropagation();

      if (modeRef.current === "mark") {
        // freehand circling: the stroke lands as a note pinned to the element
        // under its first point, Claude-review style
        const at = edDoc().elementFromPoint(e.clientX, e.clientY);
        drag.current = {
          kind: "mark",
          points: [[e.clientX, e.clientY]],
          startEl: at && isEditable(at) ? nearestBlock(at) : null,
        };
        return;
      }

      if (modeRef.current === "sections") {
        if (!el) return;
        drag.current = { kind: "section", el, startY: e.clientY };
        el.style.opacity = "0.45";
        setSelection([el]);
        return;
      }

      if (el && e.shiftKey) {
        const cur = selRef.current;
        setSelection(cur.includes(el) ? cur.filter((x) => x !== el) : [...cur, el]);
        return;
      }

      // RESIZE: grabbing within 7px of a selected element's right/bottom edge
      // resizes it, the way every canvas tool works. Corner = both axes.
      const prim = selRef.current[0];
      if (prim && selRef.current.length === 1) {
        const r = rectOf(prim);
        const nearE = Math.abs(e.clientX - r.right) < 7 && e.clientY > r.top - 7 && e.clientY < r.bottom + 7;
        const nearS = Math.abs(e.clientY - r.bottom) < 7 && e.clientX > r.left - 7 && e.clientX < r.right + 7;
        if (nearE || nearS) {
          const p = store.pathOf(prim);
          drag.current = {
            kind: "resize",
            el: prim,
            edge: nearE && nearS ? "se" : nearE ? "e" : "s",
            startX: e.clientX,
            startY: e.clientY,
            baseW: r.width,
            baseH: r.height,
            starts: [
              { key: `${p}|width`, before: store.changes.get(`${p}|width`) },
              { key: `${p}|height`, before: store.changes.get(`${p}|height`) },
              { key: `${p}|max-width`, before: store.changes.get(`${p}|max-width`) },
            ],
            moved: false,
          };
          edDoc().body.style.cursor = nearE && nearS ? "nwse-resize" : nearE ? "ew-resize" : "ns-resize";
          return;
        }
      }

      // FLEX/GRID REORDER: inside an auto-layout-ish parent, a drag means
      // "change my place in the row", the Figma instinct. The click usually
      // lands on a heading INSIDE the card, so climb from the selection to the
      // nearest ancestor that is a direct child of a flex/grid container and
      // reorder THAT. Alt keeps the free translate move.
      if (el && selRef.current.length === 1 && selRef.current[0] === el && !e.altKey) {
        let child: HTMLElement | null = el;
        let hops = 0;
        while (child && hops < 4) {
          const par: HTMLElement | null = child.parentElement;
          if (par) {
            const disp = csOf(par).display;
            const kids = [...par.children].filter((c) => isElem(c) && !c.hasAttribute("data-editmode-ui"));
            if ((disp.includes("flex") || disp.includes("grid")) && kids.length > 1) {
              drag.current = { kind: "reorder", el: child, parent: par, startIdx: kids.indexOf(child), moved: false };
              child.style.opacity = "0.5";
              edDoc().body.style.cursor = "grabbing";
              return;
            }
          }
          child = par;
          hops += 1;
        }
      }

      if (el && selRef.current.includes(el)) {
        const els = selRef.current;
        const peers = el.parentElement
          ? [...el.parentElement.children]
              .filter((s): s is HTMLElement => isElem(s) && !els.includes(s) && !s.hasAttribute("data-editmode-ui"))
              .map(rectOf)
          : [];
        drag.current = {
          kind: "move",
          startX: e.clientX,
          startY: e.clientY,
          els,
          topBases: els.map((x) => readProp(x, "margin-top")),
          bottomBases: els.map((x) => readProp(x, "margin-bottom")),
          leftBases: els.map((x) => readProp(x, "margin-left")),
          rightBases: els.map((x) => readProp(x, "margin-right")),
          trBases: els.map((x) => {
            const tr = csOf(x).translate;
            if (!tr || tr === "none") return [0, 0] as [number, number];
            const parts = tr.split(" ").map((v) => parseFloat(v) || 0);
            return [parts[0] ?? 0, parts[1] ?? 0] as [number, number];
          }),
          rect: rectOf(el),
          peers,
          moved: false,
          starts: els.flatMap((x) => {
            const p = store.pathOf(x);
            return ["margin-top", "margin-left", "translate"].map((prop) => ({
              key: `${p}|${prop}`,
              before: store.changes.get(`${p}|${prop}`),
            }));
          }),
        };
        edDoc().body.style.cursor = "grabbing";
        return;
      }

      // clicked empty space or an unselected element: either a click-select /
      // deselect, or the start of a marquee; which one is known at pointerup
      drag.current = { kind: "marquee", startX: e.clientX, startY: e.clientY, cands: null, clicked: el, moved: false };
    };

    const onMove = (e: PointerEvent) => {
      const d = drag.current;

      if (d?.kind === "marquee") {
        if (!d.moved && Math.abs(e.clientX - d.startX) < 5 && Math.abs(e.clientY - d.startY) < 5) return;
        if (!d.moved) {
          d.moved = true;
          // measured HERE, once the gesture is provably a marquee, never on click
          d.cands = marqueeCandidates(sectionWrap() ?? edDoc().body);
        }
        const box = boxFrom(d.startX, d.startY, e.clientX, e.clientY);
        setMarquee(box);
        setSelection(marqueeHits(d.cands!, box));
        return;
      }

      if (d?.kind === "move") {
        // the same 5px threshold as the marquee: a click's jitter on a selected
        // element must not write a snapped 4px margin change
        if (!d.moved && Math.abs(e.clientX - d.startX) < 5 && Math.abs(e.clientY - d.startY) < 5) return;
        d.moved = true;
        // FREE 2D MOVE: both axes at once, the way a canvas tool drags. The
        // vertical axis keeps sibling-edge snapping; the horizontal snaps to
        // the 4px grid. Solo mode compensates the opposite margin on BOTH axes
        // so the element's occupied box never changes and nothing else shifts.
        const rawY = e.clientY - d.startY;
        const rawX = e.clientX - d.startX;
        const { delta, guides: g } = e.altKey ? { delta: rawY, guides: [] } : snapVertical(d.rect, rawY, d.peers);
        const dx = e.altKey ? rawX : Math.round(rawX / 4) * 4;
        d.els.forEach((el, i) => {
          if (moveModeRef.current === "isolate") {
            // SOLO = the translate property: by definition it repositions the
            // element without touching layout, on any display type. The old
            // negative-margin pairing leaked a few px around inline elements
            // (line-box arithmetic) and read as noise in the report.
            const [bx, by] = d.trBases[i];
            store.writeLiveRaw(el, "translate", `${Math.round(bx + dx)}px ${Math.round(by + delta)}px`);
          } else {
            store.writeLive(el, "margin-top", d.topBases[i] + delta);
            store.writeLive(el, "margin-left", d.leftBases[i] + dx);
          }
        });
        setGuides(g);
        setNote(`${dx >= 0 ? "+" : ""}${Math.round(dx)}, ${delta >= 0 ? "+" : ""}${Math.round(delta)}px`);
        bump();
        return;
      }

      if (d?.kind === "reorder") {
        d.moved = true;
        const kids = [...d.parent.children].filter(
          (c): c is HTMLElement => isElem(c) && !c.hasAttribute("data-editmode-ui") && c !== d.el,
        );
        // reading order: the pointer belongs before the first sibling whose
        // row it is above, or whose centre it is left of within the same row
        let target: HTMLElement | null = null;
        for (const k of kids) {
          const r = rectOf(k);
          if (e.clientY < r.top + r.height / 2 || (e.clientY < r.bottom && e.clientX < r.left + r.width / 2)) {
            target = k;
            break;
          }
        }
        const already = target ? d.el.nextElementSibling === target : d.parent.lastElementChild === d.el;
        if (!already) {
          d.parent.insertBefore(d.el, target);
          bump();
        }
        setNote("reordering · alt+drag moves freely instead");
        return;
      }

      if (d?.kind === "resize") {
        if (!d.moved && Math.abs(e.clientX - d.startX) < 3 && Math.abs(e.clientY - d.startY) < 3) return;
        d.moved = true;
        if (d.edge !== "s") {
          const w = d.baseW + (e.clientX - d.startX);
          store.writeLive(d.el, "width", w);
          // a max-width ceiling (very common on text blocks) silently wins over
          // width, which read as "the text cannot be stretched"; growing past
          // the ceiling raises the ceiling with it
          const mw = csOf(d.el).maxWidth;
          if (mw !== "none" && w > parseFloat(mw)) store.writeLive(d.el, "max-width", w);
        }
        if (d.edge !== "e") store.writeLive(d.el, "height", d.baseH + (e.clientY - d.startY));
        const r = rectOf(d.el);
        setNote(`${Math.round(r.width)} × ${Math.round(r.height)}`);
        bump();
        return;
      }

      if (d?.kind === "mark") {
        d.points.push([e.clientX, e.clientY]);
        setLiveStroke(d.points.map(([x, y]) => `${x},${y}`).join(" "));
        return;
      }

      if (d?.kind === "section") return;

      const el = pick(e.clientX, e.clientY);
      setHover(el);
      // resize affordance on the selection's edges
      const prim = selRef.current[0];
      if (prim && selRef.current.length === 1) {
        const r = rectOf(prim);
        const nearE = Math.abs(e.clientX - r.right) < 7 && e.clientY > r.top - 7 && e.clientY < r.bottom + 7;
        const nearS = Math.abs(e.clientY - r.bottom) < 7 && e.clientX > r.left - 7 && e.clientX < r.right + 7;
        edDoc().body.style.cursor = nearE && nearS ? "nwse-resize" : nearE ? "ew-resize" : nearS ? "ns-resize" : "";
      }
      const sel = selRef.current[0];
      if (e.altKey && sel && el && el !== sel) setSpans(measure(rectOf(sel), rectOf(el)));
      else setSpans([]);
    };

    const onUp = (e: PointerEvent) => {
      const d = drag.current;
      endDrag();
      if (!d) return;

      if (d.kind === "mark") {
        setLiveStroke(null);
        if (d.points.length > 4 && d.startEl) {
          // the stroke is stored RELATIVE to the circled element's rect, so it
          // travels with the element on scroll instead of floating on screen
          const r = d.startEl.getBoundingClientRect();
          const pts = d.points.map(([x, y]) => `${x},${y}`).join(" ");
          setNoteDraft({ el: d.startEl, text: "", mark: `${Math.round(r.left)},${Math.round(r.top)}|${pts}` });
        }
        return;
      }

      if (d.kind === "marquee") {
        if (!d.moved) setSelection(d.clicked ? [d.clicked] : []);
        else flash(`${selRef.current.length} selected`);
        return;
      }

      if (d.kind === "reorder") {
        if (d.moved) {
          const kids = [...d.parent.children].filter((c): c is HTMLElement => isElem(c) && !c.hasAttribute("data-editmode-ui"));
          store.setOrder(kids.map((k, idx) => sectionLabel(k, idx)), d.parent);
          flash("reordered · the report tells the applier the new order (preview, refresh restores)");
        }
        return;
      }

      if (d.kind === "section") {
        const wrap = sectionWrap();
        if (wrap && Math.abs(e.clientY - d.startY) > 24) {
          const others = ([...wrap.children].filter(isElem) as HTMLElement[]).filter((s) => s !== d.el);
          const before = others.find((s) => e.clientY < rectOf(s).top + rectOf(s).height / 2);
          wrap.insertBefore(d.el, before ?? null);
          store.setOrder(([...wrap.children].filter(isElem) as HTMLElement[]).map((s, i) => sectionLabel(s, i)));
          flash("section moved (preview, refresh restores)");
        }
        return;
      }

      if ((d.kind === "move" || d.kind === "resize") && d.moved) {
        store.commitDrag(d.starts);
        bump();
      }
    };

    // a cancelled pointer (browser gesture, window blur mid-drag) must not
    // leave a stale drag, a grabbing cursor or a half-transparent section
    const onCancel = () => {
      const d = drag.current;
      if ((d?.kind === "move" || d?.kind === "resize") && d.moved) store.commitDrag(d.starts);
      endDrag();
    };

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.closest?.("[data-editmode-ui]")) {
        // focus lives in the panel after any click on it. Typing must keep its
        // native behaviour, but undo/redo belong to the EDITOR wherever focus
        // sits; without this, cmd+Z went dead until the next canvas click.
        const typing = t.matches?.("input, select, textarea, [contenteditable], [contenteditable] *");
        const meta = e.metaKey || e.ctrlKey;
        if (!typing && meta && e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) store.redo();
          else store.undo();
          bump();
        }
        return;
      }

      if (editingText.current) {
        if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
          e.preventDefault();
          editingText.current.blur();
        }
        return;
      }

      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        bump();
        return;
      }
      if (meta && e.key.toLowerCase() === "c" && selRef.current.length) {
        e.preventDefault();
        copyStyle();
        return;
      }
      if (meta && e.key.toLowerCase() === "v" && selRef.current.length) {
        e.preventDefault();
        pasteStyle();
        return;
      }
      // no other shortcut owns a modifier; letting a metaed key fall through
      // would fire the single-letter toggles below (cmd+C used to flip centring)
      if (meta) return;

      if (e.key === "Tab") {
        e.preventDefault();
        setMode((m) => (m === "spacing" ? "sections" : "spacing"));
        return;
      }
      if (e.key === "Escape") {
        setSelection([]);
        return;
      }

      const sel = selRef.current;
      const primary = sel[0];

      if (e.key === "?") return setShowKeys((v) => !v);
      if (e.key === "s" || e.key === "S") return setShowSpacing((v) => !v);
      if (e.key === "g" || e.key === "G") return setShowGrid((v) => !v);
      if (e.key === "c" || e.key === "C") return setShowCentring((v) => !v);
      if (e.key === "p" || e.key === "P") return setMoveMode((m) => (m === "push" ? "isolate" : "push"));

      if (!primary) return;

      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        const existing = changes.find((c) => c.prop === "note" && fromDomPath(c.path) === primary);
        setNoteDraft({ el: primary, text: existing?.value ?? "" });
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        startTextEdit(primary);
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (primary.parentElement && primary.parentElement.tagName !== "BODY") setSelection([primary.parentElement]);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const kid = [...primary.children].find((c): c is HTMLElement => isElem(c) && !c.hasAttribute("data-editmode-ui"));
        if (kid) setSelection([kid]);
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        nudge((e.shiftKey ? 10 : 1) * (e.key === "ArrowUp" ? -1 : 1));
        return;
      }
      if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        primary.after(primary.cloneNode(true));
        flash("duplicated · PREVIEW ONLY, not undoable, refresh removes it");
        bump();
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        hideSelection();
      }
    };

    // double-click: on TEXT it starts editing the words (the Figma instinct
    // everyone has); on a container it drills into the group
    const onDouble = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest?.("[data-editmode-ui]")) return;
      if (modeRef.current !== "spacing") return;
      e.preventDefault();
      e.stopPropagation();
      const deep = pick(e.clientX, e.clientY, true);
      if (!deep) return;
      setSelection([deep]);
      const hasText = [...deep.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim());
      if (hasText) startTextEdit(deep);
    };

    const swallow = (ev: Event) => {
      const t = ev.target as HTMLElement;
      if (t?.closest?.("[data-editmode-ui]")) return;
      if (editingText.current && editingText.current.contains(t)) return;
      if ((ev as MouseEvent).metaKey) return; // cmd+click passes through
      ev.preventDefault();
      ev.stopPropagation();
      // the first time a real link or button gets eaten, say how to use it
      if (!linkHint.current && t?.closest?.("a, button")) {
        linkHint.current = true;
        flash("links are paused while editing · ⌘+click follows them · ✕ pauses the editor");
      }
    };

    // IMAGE DROP: a file dragged onto an <img> previews the swap immediately
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      const t = edDoc().elementFromPoint(e.clientX, e.clientY);
      if (t && (t as HTMLElement).closest && !(t as HTMLElement).closest("[data-editmode-ui]")) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      const file = e.dataTransfer?.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      const t = edDoc().elementFromPoint(e.clientX, e.clientY);
      const img = t && (t as HTMLElement).closest ? ((t as HTMLElement).closest("img") as HTMLImageElement | null) : null;
      if (!img) {
        flash("drop it ON an image to swap that image");
        e.preventDefault();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      store.setImage(img, file);
      setSelection([img]);
      flash(`image swapped with ${file.name} · the report will name the file`);
      bump();
    };

    // bound on the TARGET realm (the iframe when the device frame is open);
    // keyboard also on the parent so shortcuts work while the panel has focus
    const w = edWin();
    w.addEventListener("pointerdown", onDown, true);
    w.addEventListener("pointermove", onMove, true);
    w.addEventListener("pointerup", onUp, true);
    w.addEventListener("pointercancel", onCancel, true);
    w.addEventListener("keydown", onKey, true);
    w.addEventListener("click", swallow, true);
    w.addEventListener("dblclick", onDouble, true);
    w.addEventListener("dragover", onDragOver, true);
    w.addEventListener("drop", onDrop, true);
    const alsoParent = w !== window;
    if (alsoParent) window.addEventListener("keydown", onKey, true);
    return () => {
      w.removeEventListener("pointerdown", onDown, true);
      w.removeEventListener("pointermove", onMove, true);
      w.removeEventListener("pointerup", onUp, true);
      w.removeEventListener("pointercancel", onCancel, true);
      w.removeEventListener("keydown", onKey, true);
      w.removeEventListener("click", swallow, true);
      w.removeEventListener("dblclick", onDouble, true);
      w.removeEventListener("dragover", onDragOver, true);
      w.removeEventListener("drop", onDrop, true);
      if (alsoParent) window.removeEventListener("keydown", onKey, true);
      try {
        edDoc().body.style.cursor = "";
      } catch {
        /* the iframe realm may already be gone */
      }
    };
  }, [on, realmTick, pick, setSelection, flash, bump, nudge, copyStyle, pasteStyle, hideSelection, changes, startTextEdit]);

  /* ------------------------------------------------------ align & distribute */

  const align = useCallback(
    (edge: "left" | "centre" | "right") => {
      const els = selRef.current;
      if (els.length < 2) return;
      const rects = els.map(rectOf);
      const target =
        edge === "left"
          ? Math.min(...rects.map((r) => r.left))
          : edge === "right"
            ? Math.max(...rects.map((r) => r.right))
            : null;
      const batch: Parameters<typeof store.commit>[0] = [];
      els.forEach((el, i) => {
        const r = rects[i];
        const base = readProp(el, "margin-left");
        if (edge === "centre") {
          const p = el.parentElement;
          if (!p) return;
          const pr = rectOf(p);
          const cs = csOf(p);
          const padL = parseFloat(cs.paddingLeft) || 0;
          const padR = parseFloat(cs.paddingRight) || 0;
          const wanted = (pr.left + padL + (pr.right - padR) - r.width) / 2;
          store.set(el, "margin-left", base + (wanted - r.left), batch);
        } else if (edge === "left") {
          store.set(el, "margin-left", base + (target! - r.left), batch);
        } else {
          store.set(el, "margin-right", readProp(el, "margin-right") + (r.right - target!), batch);
        }
      });
      store.commit(batch);
      bump();
      flash(`aligned ${edge}`);
    },
    [bump, flash],
  );

  const distribute = useCallback(() => {
    const els = selRef.current;
    if (els.length < 3) return flash("select at least three to distribute");
    const { sorted, gaps } = verticalGaps(els);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const batch: Parameters<typeof store.commit>[0] = [];
    for (let i = 1; i < sorted.length; i += 1) {
      store.set(sorted[i], "margin-top", readProp(sorted[i], "margin-top") + (avg - gaps[i - 1]), batch);
    }
    store.commit(batch);
    bump();
    flash(`gaps equalised to ${Math.round(avg)}px`);
  }, [bump, flash]);

  const copyReport = useCallback(() => {
    const text = store.report();
    navigator.clipboard.writeText(text).then(
      () => flash(`copied · ${changes.length} change${changes.length === 1 ? "" : "s"} · paste it to Claude`),
      () => flash("clipboard blocked, the report is in the console"),
    );
    console.log(text);
  }, [flash, changes.length]);

  const toggleOriginal = useCallback(() => {
    const off = store.toggleOriginal();
    setShowingOriginal(off);
    flash(off ? "showing the ORIGINAL page · click again for your edits" : "showing your edits");
    bump();
  }, [flash, bump]);

  /**
   * A/B: first click on an empty slot SAVES the current state; a click on a
   * saved slot LOADS it; alt+click overwrites. Editing after a load makes the
   * page diverge from the slot until it is saved again.
   */
  const variant = useCallback(
    (slot: "A" | "B", save: boolean) => {
      if (save || !store.hasVariant(slot)) {
        store.saveVariant(slot);
        setVariantSaved({ A: store.hasVariant("A"), B: store.hasVariant("B") });
        setActiveVariant(slot);
        flash(`current state saved as variant ${slot}`);
        return;
      }
      if (store.loadVariant(slot)) {
        setActiveVariant(slot);
        setShowingOriginal(false);
        flash(`variant ${slot} loaded`);
        bump();
      }
    },
    [flash, bump],
  );

  /* --------------------------------------------------------- device frame */

  const openFrame = useCallback(
    (spec: FrameSpec) => {
      setSelection([]);
      setHover(null);
      setFrameSpec(spec);
    },
    [setSelection],
  );

  const onFrameReady = useCallback(
    (win: Window, doc: Document) => {
      // a cached OLD bundle inside the frame may have mounted its own editor
      // before this guard generation existed; retire it
      try {
        const w = win as unknown as { __PAVEL_EDITOR__?: boolean; __PAVEL_EDITOR_UNMOUNT__?: () => void };
        w.__PAVEL_EDITOR_UNMOUNT__?.();
        w.__PAVEL_EDITOR__ = true;
        doc.querySelectorAll("[data-editmode-ui]").forEach((n) => n.remove());
      } catch {
        /* cross-origin frame or torn-down realm: nothing to retire */
      }
      setEditTarget(win, doc);
      setFrameRealm({ win, doc });
      setSelection([]);
      setHover(null);
      // the frame is a fresh page load: re-apply the session's edits into it
      const timers = [100, 600, 1600].map((ms) => window.setTimeout(() => store.restoreFromStorage(), ms));
      void timers;
      setRealmTick((t) => t + 1);
    },
    [setSelection],
  );

  const closeFrame = useCallback(() => {
    setEditTarget(null);
    setFrameRealm(null);
    setFrameSpec(null);
    setSelection([]);
    setHover(null);
    // edits made inside the frame exist only in ITS document; the parent page
    // needs them re-applied now that it is the canvas again
    [50, 400].forEach((ms) => window.setTimeout(() => store.restoreFromStorage(), ms));
    setRealmTick((t) => t + 1);
  }, [setSelection]);

  /* ---------------------------------------------------------------- render */

  if (!armed) return null;

  // "off" collapses to a pill instead of vanishing: the old behaviour was a
  // dead end with no way back short of a reload
  if (!on) {
    return (
      <button
        data-editmode-ui=""
        className="pe-btn on"
        onClick={() => setOn(true)}
        style={{ position: "fixed", bottom: 14, right: 14, zIndex: 2147483000, height: 30, letterSpacing: "0.12em" }}
      >
        ✎ EDIT
      </button>
    );
  }

  const pins: Array<{ el: HTMLElement; text: string; n: number; mark?: string }> = [];
  changes
    .filter((c) => c.prop === "note")
    .forEach((c, idx) => {
      const el = fromDomPath(c.path);
      if (el) pins.push({ el, text: c.value, n: idx + 1, mark: c.mark });
    });

  const overlayEl = (
    <Overlay
      hover={hover}
      selection={selection}
      marquee={marquee}
      guides={guides}
      spans={spans}
      sectionsMode={mode === "sections"}
      showSpacing={showSpacing}
      showGrid={showGrid}
      showCentring={showCentring}
      note={note}
      pins={pins}
      liveStroke={liveStroke}
    />
  );

  return (
    <>
      {/* the overlay draws in whichever document is the canvas */}
      {frameRealm ? createPortal(overlayEl, frameRealm.doc.body) : overlayEl}

      {frameSpec && <Frame spec={frameSpec} onChange={setFrameSpec} onReady={onFrameReady} onClose={closeFrame} />}

      <Panel
        mode={mode}
        setMode={setMode}
        tab={tab}
        setTab={setTab}
        selection={selection}
        setSelection={setSelection}
        moveMode={moveMode}
        setMoveMode={setMoveMode}
        showSpacing={showSpacing}
        setShowSpacing={setShowSpacing}
        showGrid={showGrid}
        setShowGrid={setShowGrid}
        showCentring={showCentring}
        setShowCentring={setShowCentring}
        scopeAll={scopeAll}
        setScopeAll={setScopeAll}
        changes={changes}
        canUndo={store.canUndo()}
        canRedo={store.canRedo()}
        onUndo={() => {
          store.undo();
          bump();
        }}
        onRedo={() => {
          store.redo();
          bump();
        }}
        onResetAll={() => {
          store.resetAll();
          bump();
          flash("reset");
        }}
        onResetOne={(k) => {
          store.resetOne(k);
          bump();
        }}
        onCopy={copyReport}
        onSet={applyProp}
        onSetRaw={applyRaw}
        onSetStyle={applyStyle}
        onAlign={align}
        onDistribute={distribute}
        onDuplicate={() => {
          const p = selRef.current[0];
          if (!p) return;
          p.after(p.cloneNode(true));
          flash("duplicated · PREVIEW ONLY, not undoable, refresh removes it");
          bump();
        }}
        onDelete={hideSelection}
        onNote={() => {
          const p = selRef.current[0];
          if (!p) return;
          const existing = changes.find((c) => c.prop === "note" && fromDomPath(c.path) === p);
          setNoteDraft({ el: p, text: existing?.value ?? "" });
        }}
        onOff={() => {
          setOn(false);
          setSelection([]);
          setHover(null);
          closeFrame();
        }}
        showKeys={showKeys}
        setShowKeys={setShowKeys}
        showingOriginal={showingOriginal}
        onToggleOriginal={toggleOriginal}
        variantSaved={variantSaved}
        activeVariant={activeVariant}
        onVariant={variant}
        frameSpec={frameSpec}
        onOpenFrame={() => openFrame({ w: 390, h: 844, label: "iPhone 14" })}
        onCloseFrame={closeFrame}
        root={root}
        setHover={setHover}
        tick={tick}
        updateTo={updateTo}
      />

      {/* note input: a floating field, because prompt() would freeze the page */}
      {noteDraft && (
        <div
          data-editmode-ui=""
          style={{
            position: "fixed",
            bottom: 48,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2147483000,
            display: "flex",
            gap: 6,
            padding: 8,
            background: UI.bg,
            border: `1px solid ${UI.violet}`,
            ...UI.mono,
          }}
        >
          <span style={{ color: UI.violet, alignSelf: "center" }}>note</span>
          <input
            autoFocus
            value={noteDraft.text}
            placeholder="what should change here?"
            onChange={(e) => setNoteDraft({ ...noteDraft, text: e.target.value })}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                store.setNote(noteDraft.el, noteDraft.text, noteDraft.mark);
                setNoteDraft(null);
                bump();
              }
              if (e.key === "Escape") setNoteDraft(null);
            }}
            style={{ width: 320, background: UI.inset, border: `1px solid ${UI.border}`, color: UI.text, padding: "6px 8px", ...UI.mono }}
          />
        </div>
      )}

      {toast && (
        <div
          data-editmode-ui=""
          style={{
            position: "fixed",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2147483000,
            padding: "8px 14px",
            background: UI.text,
            color: "#0b0b0b",
            fontWeight: 600,
            ...UI.mono,
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
