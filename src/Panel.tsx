"use client";

/**
 * The control panel, built as an instrument rather than a form: 272px, 4px
 * grid, hairlines never heavier than 1px, radius 0, all-mono, two accents with
 * fixed jobs (mint = active/changed/focus, violet = selection only).
 *
 * Inline styles on purpose: the panel renders inside the page it edits, so a
 * stylesheet of its own could collide with the site's CSS, and a class of its
 * own would appear in the very class lists the editor inspects.
 *
 * NO key={tick} on the root. The panel re-renders from props; remounting it per
 * tick (the old code) destroyed its scroll position and every open popover on
 * each page scroll, which made the lower half of the inspector unreachable.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  GROUPS,
  PROPS,
  STYLE_GROUPS,
  STYLE_PROPS,
  colorTokens,
  describe,
  domPath,
  loadedFonts,
  matchingElements,
  readProp,
  readStyle,
  ruleReach,
  shortLabel,
  toHex,
  type NumProp,
} from "./selectors";
import { centring } from "./geometry";
import { csOf } from "./context";
import type { Change } from "./store";
import type { FrameSpec } from "./Frame";
import { UI, inputStyle, sectionHeader, toolBtn } from "./theme";

export type Tab = "design" | "layers" | "changes";
export type MoveMode = "push" | "isolate";

const PANEL_W = 272;

/* ------------------------------------------------------------- primitives */

function Header({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        width: "100%",
        height: 30,
        padding: "0 12px",
        cursor: "pointer",
        background: "transparent",
        border: "none",
        borderBottom: `1px solid ${UI.border}`,
        textAlign: "left",
        ...sectionHeader,
      }}
    >
      <span style={{ color: UI.faint, fontSize: 9 }}>{open ? "▾" : "▸"}</span>
      {title}
    </button>
  );
}

/**
 * A numeric row: scrubbable label, exact input, changed-state tick.
 *
 * The label is an ew-resize drag surface (shift x10, alt x0.1), which is what
 * makes the panel feel like an instrument instead of a form. Scrubbing writes
 * PREVIEW styles directly and commits once on release, so a whole scrub is one
 * undo step, matching how drags on the canvas behave.
 */
function NumRow({
  prop,
  value,
  mixed,
  changed,
  el,
  onSet,
  onResetKey,
}: {
  prop: NumProp;
  value: number;
  mixed: boolean;
  changed: boolean;
  el: HTMLElement;
  onSet: (v: number) => void;
  onResetKey?: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [focus, setFocus] = useState(false);
  const scrub = useRef<{ startX: number; base: number; prevInline: string } | null>(null);
  const spec = PROPS[prop];

  const onScrubDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    // the pre-scrub INLINE value, so the preview can be unwound on release: the
    // store captures an element's base by reading it, and committing while the
    // preview is still applied made base == value, which recorded nothing
    scrub.current = { startX: e.clientX, base: value, prevInline: el.style.getPropertyValue(prop) };
  };
  const onScrubMove = (e: React.PointerEvent) => {
    const s = scrub.current;
    if (!s) return;
    const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const v = s.base + (e.clientX - s.startX) * spec.step * mult;
    // preview only; the single undo entry lands on release via onSet
    el.style.setProperty(prop, `${Math.max(spec.min, Math.round(v / spec.step) * spec.step)}${spec.unit}`);
  };
  const onScrubUp = (e: React.PointerEvent) => {
    const s = scrub.current;
    scrub.current = null;
    if (!s) return;
    // unwind the preview FIRST, so the store reads the true pre-scrub state
    if (s.prevInline) el.style.setProperty(prop, s.prevInline);
    else el.style.removeProperty(prop);
    const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const v = s.base + (e.clientX - s.startX) * spec.step * mult;
    if (Math.abs(v - s.base) > 0.001) onSet(v);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", height: 26, padding: "0 12px", position: "relative" }}>
      {changed && (
        <button
          title="changed from the stylesheet · click to reset"
          onClick={onResetKey}
          style={{
            position: "absolute",
            left: 0,
            top: 4,
            bottom: 4,
            width: 3,
            padding: 0,
            border: "none",
            cursor: "pointer",
            background: UI.mint,
          }}
        />
      )}
      <span
        onPointerDown={onScrubDown}
        onPointerMove={onScrubMove}
        onPointerUp={onScrubUp}
        title="drag to scrub · shift x10 · alt fine"
        style={{ width: 118, color: UI.dim, cursor: "ew-resize", userSelect: "none", ...UI.mono, fontSize: 10, letterSpacing: "0.06em" }}
      >
        {prop}
      </span>
      <input
        value={draft ?? (mixed ? "mixed" : String(value))}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => {
          setFocus(false);
          if (draft !== null && draft !== "" && Number.isFinite(Number(draft))) onSet(Number(draft));
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setDraft(null);
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            onSet(value + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1) * spec.step);
          }
          e.stopPropagation();
        }}
        style={{
          ...inputStyle,
          marginLeft: "auto",
          width: 64,
          textAlign: "right",
          borderColor: focus ? UI.mint : UI.border,
          color: mixed && draft === null ? UI.faint : changed ? UI.mint : UI.text,
        }}
      />
    </div>
  );
}

function ColorRow({
  label,
  value,
  tokens,
  onSet,
}: {
  label: string;
  value: string;
  tokens: Array<{ name: string; value: string }>;
  onSet: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const hex = toHex(value);
  const hasEyedropper = typeof window !== "undefined" && "EyeDropper" in window;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, height: 26, padding: "0 12px" }}>
        <span style={{ width: 96, color: UI.dim, ...UI.mono, fontSize: 10, letterSpacing: "0.06em" }}>{label}</span>
        <button
          onClick={() => setOpen((o) => !o)}
          title="design tokens"
          style={{ width: 20, height: 16, padding: 0, cursor: "pointer", background: value, border: `1px solid ${open ? UI.mint : UI.border}` }}
        />
        <input
          type="color"
          value={hex}
          onChange={(e) => onSet(e.target.value)}
          style={{ width: 22, height: 16, padding: 0, border: `1px solid ${UI.border}`, background: "transparent", cursor: "pointer" }}
        />
        {hasEyedropper && (
          <button
            style={{ ...toolBtn(), height: 18, padding: "0 5px" }}
            title="sample from the page"
            onClick={async () => {
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const res = await new (window as any).EyeDropper().open();
                onSet(res.sRGBHex);
              } catch {
                /* dismissed */
              }
            }}
          >
            ⌖
          </button>
        )}
        <span style={{ marginLeft: "auto", color: UI.faint, ...UI.mono, fontSize: 9 }}>{hex}</span>
      </div>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4, padding: "2px 12px 8px 12px" }}>
          {tokens.length === 0 && <span style={{ color: UI.faint, gridColumn: "1 / -1", ...UI.mono, fontSize: 9 }}>no tokens found</span>}
          {tokens.map((t) => (
            <button
              key={t.name}
              title={t.name}
              onClick={() => {
                onSet(t.value);
                setOpen(false);
              }}
              style={{ aspectRatio: "1", padding: 0, cursor: "pointer", border: `1px solid ${UI.border}`, background: t.value }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EnumRow({ label, value, options, onSet }: { label: string; value: string; options: string[]; onSet: (v: string) => void }) {
  const opts = options.includes(value) ? options : [value, ...options];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, height: 26, padding: "0 12px" }}>
      <span style={{ width: 96, color: UI.dim, ...UI.mono, fontSize: 10, letterSpacing: "0.06em" }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onSet(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        style={{ ...inputStyle, flex: 1, minWidth: 0 }}
      >
        {opts.map((o) => (
          <option key={o} value={o}>
            {o.length > 30 ? `${o.slice(0, 30)}…` : o}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextRow({ label, value, placeholder, onSet }: { label: string; value: string; placeholder?: string; onSet: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === "none" || !value ? "" : value);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, height: 26, padding: "0 12px" }}>
      <span style={{ width: 96, color: UI.dim, ...UI.mono, fontSize: 10, letterSpacing: "0.06em" }}>{label}</span>
      <input
        value={shown}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null) onSet(draft.trim() || "none");
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setDraft(null);
          e.stopPropagation();
        }}
        style={{ ...inputStyle, flex: 1, minWidth: 0 }}
      />
    </div>
  );
}

/* ------------------------------------------------------------ layers tree */

function Layers({
  root,
  selection,
  onPick,
  onHover,
}: {
  root: HTMLElement | null;
  selection: HTMLElement[];
  onPick: (el: HTMLElement) => void;
  onHover: (el: HTMLElement | null) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (!root) return <span style={{ color: UI.faint, padding: 12, display: "block", ...UI.mono }}>no page root found</span>;

  const key = (el: HTMLElement) => {
    const parts: string[] = [];
    let n: HTMLElement | null = el;
    while (n && n !== root) {
      parts.unshift(String([...(n.parentElement?.children ?? [])].indexOf(n)));
      n = n.parentElement;
    }
    return parts.join(".");
  };
  const onPath = (el: HTMLElement) => selection.some((s) => el.contains(s));

  const render = (el: HTMLElement, depth: number): React.ReactNode => {
    if (depth > 6) return null;
    const k = key(el);
    const kids = [...el.children].filter((c): c is HTMLElement => c.nodeType === 1 && !c.hasAttribute("data-editmode-ui"));
    const isOpen = open.has(k) || onPath(el);
    const selected = selection.includes(el);
    return (
      <div key={k}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 3,
            height: 22,
            paddingLeft: 8 + depth * 10,
            color: selected ? UI.violet : UI.text,
            background: selected ? "rgba(139,92,246,0.12)" : undefined,
            cursor: "pointer",
          }}
          onMouseEnter={() => onHover(el)}
          onMouseLeave={() => onHover(null)}
        >
          <button
            onClick={() =>
              setOpen((prev) => {
                const next = new Set(prev);
                if (next.has(k)) next.delete(k);
                else next.add(k);
                return next;
              })
            }
            style={{ width: 12, border: "none", background: "transparent", color: UI.faint, cursor: "pointer", padding: 0, ...UI.mono, fontSize: 9 }}
          >
            {kids.length ? (isOpen ? "▾" : "▸") : "·"}
          </button>
          <button
            onClick={() => onPick(el)}
            style={{
              border: "none",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              padding: 0,
              textAlign: "left",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              ...UI.mono,
              fontSize: 10,
            }}
          >
            {shortLabel(el)}
          </button>
        </div>
        {isOpen && kids.map((c) => render(c, depth + 1))}
      </div>
    );
  };

  return <div style={{ maxHeight: 340, overflow: "auto", padding: "4px 0" }}>{[...root.children].filter((c): c is HTMLElement => c.nodeType === 1).map((c) => render(c, 0))}</div>;
}

/* ------------------------------------------------------------------ panel */

export function Panel({
  mode,
  setMode,
  tab,
  setTab,
  selection,
  setSelection,
  moveMode,
  setMoveMode,
  showSpacing,
  setShowSpacing,
  showGrid,
  setShowGrid,
  showCentring,
  setShowCentring,
  scopeAll,
  setScopeAll,
  changes,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onResetAll,
  onResetOne,
  onCopy,
  onSet,
  onSetStyle,
  onAlign,
  onDistribute,
  onDuplicate,
  onDelete,
  onNote,
  onOff,
  frameSpec,
  onOpenFrame,
  onCloseFrame,
  root,
  setHover,
  tick,
}: {
  mode: "spacing" | "sections";
  setMode: (m: "spacing" | "sections") => void;
  tab: Tab;
  setTab: (t: Tab) => void;
  selection: HTMLElement[];
  setSelection: (els: HTMLElement[]) => void;
  moveMode: MoveMode;
  setMoveMode: (m: MoveMode) => void;
  showSpacing: boolean;
  setShowSpacing: (v: boolean) => void;
  showGrid: boolean;
  setShowGrid: (v: boolean) => void;
  showCentring: boolean;
  setShowCentring: (v: boolean) => void;
  scopeAll: boolean;
  setScopeAll: (v: boolean) => void;
  changes: Change[];
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onResetAll: () => void;
  onResetOne: (key: string) => void;
  onCopy: () => void;
  onSet: (prop: NumProp, value: number) => void;
  onSetStyle: (prop: string, value: string) => void;
  onAlign: (edge: "left" | "centre" | "right") => void;
  onDistribute: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onNote: () => void;
  onOff: () => void;
  frameSpec: FrameSpec | null;
  onOpenFrame: () => void;
  onCloseFrame: () => void;
  root: HTMLElement | null;
  setHover: (el: HTMLElement | null) => void;
  tick: number;
}) {
  void tick; // re-render trigger only; the panel reads the live DOM each pass

  const primary = selection[0] ?? null;
  const reach = primary ? ruleReach(primary) : 1;
  const matchCount = primary ? matchingElements(primary).length : 1;
  const c = primary ? centring(primary) : null;
  const primaryPath = primary ? domPath(primary) : null;
  const changedKeys = useMemo(() => new Set(changes.map((ch) => ch.key)), [changes]);

  // both walk the whole document; cache per selection, NOT per tick
  const tokens = useMemo(() => (primary ? colorTokens() : []), [primary]);
  const fonts = useMemo(() => (primary ? loadedFonts() : []), [primary]);

  // collapsible groups, remembered across sessions
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("em-open-groups");
      if (raw) return new Set(JSON.parse(raw));
    } catch {
      /* default below */
    }
    return new Set(["spacing", "typography", "element"]);
  });
  const toggleGroup = (g: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      try {
        localStorage.setItem("em-open-groups", JSON.stringify([...next]));
      } catch {
        /* fine */
      }
      return next;
    });

  // the panel is draggable by its header and remembers where it was put
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem("em-panel-pos");
      if (raw) return JSON.parse(raw);
    } catch {
      /* default */
    }
    return null;
  });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!dragRef.current) return;
  }, []);
  const onHeadDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).tagName === "BUTTON") return;
    const r = panelRef.current?.getBoundingClientRect();
    if (!r) return;
    dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHeadMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const x = Math.min(window.innerWidth - 60, Math.max(0, e.clientX - d.dx));
    const y = Math.min(window.innerHeight - 40, Math.max(0, e.clientY - d.dy));
    setPos({ x, y });
  };
  const onHeadUp = () => {
    if (dragRef.current && pos) {
      try {
        localStorage.setItem("em-panel-pos", JSON.stringify(pos));
      } catch {
        /* fine */
      }
    }
    dragRef.current = null;
  };

  const [minimised, setMinimised] = useState(false);
  const [copied, setCopied] = useState(false);

  const crumbs: HTMLElement[] = [];
  {
    let n: HTMLElement | null = primary;
    while (n && n.tagName !== "BODY" && crumbs.length < 9) {
      const cur: HTMLElement = n;
      crumbs.unshift(cur);
      if (cur.tagName === "SECTION") break;
      n = cur.parentElement;
    }
  }

  const place: React.CSSProperties = pos ? { top: pos.y, left: pos.x } : { top: 10, right: 10 };

  return (
    <div
      ref={panelRef}
      data-editmode-ui=""
      style={{
        position: "fixed",
        ...place,
        width: PANEL_W,
        maxHeight: "94vh",
        display: "flex",
        flexDirection: "column",
        zIndex: 2147483000,
        color: UI.text,
        background: UI.bg,
        border: `1px solid ${UI.border}`,
        boxShadow: "0 16px 60px rgba(0,0,0,0.55)",
        ...UI.mono,
      }}
    >
      {/* header: drag surface, identity, viewport, master controls */}
      <div
        onPointerDown={onHeadDown}
        onPointerMove={onHeadMove}
        onPointerUp={onHeadUp}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          height: 34,
          padding: "0 8px 0 12px",
          borderBottom: `1px solid ${UI.border}`,
          cursor: "grab",
          userSelect: "none",
          flex: "none",
        }}
      >
        <span style={{ color: UI.faint, letterSpacing: "0.06em", fontSize: 9 }}>⋮⋮</span>
        <span style={{ fontWeight: 700, fontSize: 10, letterSpacing: "0.12em" }}>PAVEL EDITOR</span>
        <span style={{ color: UI.faint, fontSize: 9, marginLeft: 4 }}>
          {frameSpec ? `${frameSpec.w}x${frameSpec.h}` : "desktop"}
        </span>
        <span style={{ flex: 1 }} />
        <button style={{ ...toolBtn(), height: 20, padding: "0 6px" }} onClick={onUndo} disabled={!canUndo} title="cmd+Z">
          ↶
        </button>
        <button style={{ ...toolBtn(), height: 20, padding: "0 6px" }} onClick={onRedo} disabled={!canRedo} title="shift+cmd+Z">
          ↷
        </button>
        <button style={{ ...toolBtn(), height: 20, padding: "0 6px" }} onClick={() => setMinimised((m) => !m)} title="collapse">
          {minimised ? "□" : "—"}
        </button>
        <button style={{ ...toolBtn(), height: 20, padding: "0 6px" }} onClick={onOff} title="hide the editor (an EDIT pill stays)">
          ×
        </button>
      </div>

      {!minimised && (
        <>
          {/* mode + view toggles */}
          <div style={{ display: "flex", gap: 4, padding: "8px 12px", borderBottom: `1px solid ${UI.border}`, flexWrap: "wrap", flex: "none" }}>
            <button style={toolBtn(mode === "spacing")} onClick={() => setMode("spacing")}>
              design
            </button>
            <button style={toolBtn(mode === "sections")} onClick={() => setMode("sections")} title="Tab switches · drag whole sections to reorder">
              sections
            </button>
            <button
              style={toolBtn(!!frameSpec)}
              onClick={() => (frameSpec ? onCloseFrame() : onOpenFrame())}
              title="preview and edit at an exact device size"
            >
              device
            </button>
            <span style={{ flex: 1 }} />
            <button style={toolBtn(moveMode === "isolate")} onClick={() => setMoveMode(moveMode === "push" ? "isolate" : "push")} title="P · push moves followers too (honest CSS), isolate moves the element alone">
              {moveMode}
            </button>
          </div>
          <div style={{ display: "flex", gap: 4, padding: "8px 12px", borderBottom: `1px solid ${UI.border}`, flex: "none" }}>
            <button style={toolBtn(showSpacing)} onClick={() => setShowSpacing(!showSpacing)} title="S">
              spacing
            </button>
            <button style={toolBtn(showCentring)} onClick={() => setShowCentring(!showCentring)} title="C">
              centring
            </button>
            <button style={toolBtn(showGrid)} onClick={() => setShowGrid(!showGrid)} title="G">
              grid
            </button>
          </div>

          {/* tabs */}
          <div style={{ display: "flex", borderBottom: `1px solid ${UI.border}`, flex: "none" }}>
            {(["design", "layers", "changes"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  height: 28,
                  border: "none",
                  borderBottom: tab === t ? `1px solid ${UI.mint}` : "1px solid transparent",
                  background: "transparent",
                  color: tab === t ? UI.text : UI.faint,
                  cursor: "pointer",
                  fontWeight: 700,
                  ...UI.mono,
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                {t}
                {t === "changes" && changes.length ? ` ${changes.length}` : ""}
              </button>
            ))}
          </div>

          <div style={{ overflow: "auto", flex: 1 }}>
            {tab === "design" && !primary && (
              <div style={{ padding: 12, color: UI.faint, fontSize: 10, lineHeight: 1.7 }}>
                click an element · drag a box for several
                <br />
                drag a selected element to move it
                <br />
                alt+hover another element = distances
                <br />
                double-click drills in · ←→ walk the tree
                <br />
                enter edits text · N pins a note
                <br />
                cmd+C / cmd+V copies style between elements
                <br />
                cmd+Z undo · esc deselect
              </div>
            )}

            {tab === "design" && primary && (
              <>
                {/* element identity */}
                <div style={{ padding: "8px 12px", borderBottom: `1px solid ${UI.border}` }}>
                  <div style={{ color: UI.faint, marginBottom: 3, fontSize: 9, lineHeight: 1.8 }}>
                    {crumbs.map((el, i) => (
                      <span key={i}>
                        <button
                          onClick={() => setSelection([el])}
                          onMouseEnter={() => setHover(el)}
                          onMouseLeave={() => setHover(null)}
                          style={{
                            border: "none",
                            background: "transparent",
                            padding: 0,
                            cursor: "pointer",
                            color: el === primary ? UI.violet : UI.dim,
                            textDecoration: el === primary ? "none" : "underline",
                            ...UI.mono,
                            fontSize: 9,
                          }}
                        >
                          {describe(el).selector.split(" ").pop()}
                        </button>
                        {i < crumbs.length - 1 && <span style={{ color: UI.faint }}> › </span>}
                      </span>
                    ))}
                  </div>
                  <div style={{ color: UI.violet, fontWeight: 600, fontSize: 11 }}>
                    {selection.length > 1 ? `${selection.length} selected` : describe(primary).label}
                  </div>
                  {reach > 1 && (
                    <div style={{ color: UI.warn, marginTop: 3, fontSize: 9 }}>
                      shared rule · {reach} elements use it
                    </div>
                  )}
                  {matchCount > 1 && (
                    <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, cursor: "pointer", fontSize: 10 }}>
                      <input type="checkbox" checked={scopeAll} onChange={(e) => setScopeAll(e.target.checked)} style={{ accentColor: UI.mint }} />
                      <span style={{ color: scopeAll ? UI.mint : UI.dim }}>edit all {matchCount} matching</span>
                    </label>
                  )}
                </div>

                {/* position in parent */}
                {c && (
                  <div style={{ padding: "6px 12px", borderBottom: `1px solid ${UI.border}`, fontSize: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ color: c.centeredX ? UI.mint : UI.warn }}>
                      {c.centeredX ? "◄ centred ►" : `off centre ${c.offsetX > 0 ? "+" : ""}${c.offsetX}`}
                    </span>
                    <span style={{ color: UI.dim }}>
                      L{c.leftGap} R{c.rightGap} T{c.topGap} B{c.bottomGap}
                    </span>
                  </div>
                )}

                {/* align + distribute for multi selections */}
                {selection.length > 1 && (
                  <div style={{ display: "flex", gap: 4, padding: "8px 12px", borderBottom: `1px solid ${UI.border}` }}>
                    <button style={toolBtn()} onClick={() => onAlign("left")}>
                      ⇤
                    </button>
                    <button style={toolBtn()} onClick={() => onAlign("centre")}>
                      ⇹
                    </button>
                    <button style={toolBtn()} onClick={() => onAlign("right")}>
                      ⇥
                    </button>
                    <button style={toolBtn()} onClick={onDistribute} title="equalise vertical gaps">
                      ≡
                    </button>
                  </div>
                )}

                {/* numeric groups */}
                {GROUPS.map((g) => {
                  const cs = csOf(primary);
                  const isFlex = cs.display.includes("flex") || cs.display.includes("grid");
                  const props = g.props.filter((p) => !p.includes("gap") || isFlex);
                  if (!props.length) return null;
                  const open = openGroups.has(g.title);
                  return (
                    <div key={g.title}>
                      <Header title={g.title} open={open} onToggle={() => toggleGroup(g.title)} />
                      {open && (
                        <div style={{ padding: "4px 0", borderBottom: `1px solid ${UI.border}` }}>
                          {props.map((prop) => {
                            const values = selection.map((el) => readProp(el, prop));
                            const mixed = values.some((v) => v !== values[0]);
                            return (
                              <NumRow
                                key={prop}
                                prop={prop}
                                value={values[0]}
                                mixed={mixed}
                                changed={!!primaryPath && changedKeys.has(`${primaryPath}|${prop}`)}
                                el={primary}
                                onSet={(v) => onSet(prop, v)}
                                onResetKey={() => primaryPath && onResetOne(`${primaryPath}|${prop}`)}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* style groups */}
                {STYLE_GROUPS.map((g) => {
                  const cs = csOf(primary);
                  const isFlex = cs.display.includes("flex") || cs.display.includes("grid");
                  const props = g.title === "flex" && !isFlex ? ["display"] : g.props;
                  const open = openGroups.has(g.title);
                  return (
                    <div key={g.title}>
                      <Header title={g.title} open={open} onToggle={() => toggleGroup(g.title)} />
                      {open && (
                        <div style={{ padding: "4px 0", borderBottom: `1px solid ${UI.border}` }}>
                          {props.map((prop) => {
                            const spec = STYLE_PROPS[prop];
                            if (!spec) return null;
                            const value = readStyle(primary, prop);
                            if (spec.kind === "color") {
                              return <ColorRow key={prop} label={spec.label} value={value} tokens={tokens} onSet={(v) => onSetStyle(prop, v)} />;
                            }
                            if (spec.kind === "enum") {
                              return (
                                <EnumRow
                                  key={prop}
                                  label={spec.label}
                                  value={value}
                                  options={prop === "font-family" ? fonts : spec.options}
                                  onSet={(v) => onSetStyle(prop, v)}
                                />
                              );
                            }
                            return <TextRow key={prop} label={spec.label} value={value} placeholder={spec.placeholder} onSet={(v) => onSetStyle(prop, v)} />;
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* element actions */}
                <div style={{ display: "flex", gap: 4, padding: "8px 12px" }}>
                  <button style={toolBtn()} onClick={onNote} title="N · pin a design note, exported with the report">
                    note
                  </button>
                  <button style={toolBtn()} onClick={onDuplicate} title="D · preview only">
                    duplicate
                  </button>
                  <button style={toolBtn()} onClick={onDelete} title="backspace · sets display none, undoable">
                    hide
                  </button>
                </div>
              </>
            )}

            {tab === "layers" && <Layers root={root} selection={selection} onPick={(el) => setSelection([el])} onHover={setHover} />}

            {tab === "changes" && (
              <div style={{ padding: "8px 0" }}>
                {!changes.length && <span style={{ color: UI.faint, padding: "0 12px" }}>no changes yet</span>}
                {changes.map((ch) => (
                  <div key={ch.key} style={{ display: "flex", gap: 6, padding: "4px 8px 4px 12px", borderLeft: `3px solid ${ch.prop === "note" ? UI.violet : UI.mint}`, marginBottom: 4 }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 10 }}>
                      <div style={{ color: UI.text }}>{ch.label}</div>
                      <div style={{ color: UI.dim, wordBreak: "break-word" }}>
                        {ch.prop === "order" ? (
                          ch.value.split("\n").join(" → ")
                        ) : ch.prop === "note" ? (
                          <span style={{ color: UI.violet }}>{ch.value}</span>
                        ) : (
                          <>
                            {ch.prop}: <span style={{ color: UI.mint }}>{ch.value}</span> <span style={{ color: UI.faint }}>was {ch.base}</span>
                            {(ch.vw ?? 1440) <= 900 && <span style={{ color: UI.warn }}> @{ch.vw}px</span>}
                          </>
                        )}
                      </div>
                    </div>
                    <button style={{ ...toolBtn(), height: 20, padding: "0 6px" }} onClick={() => onResetOne(ch.key)} title="reset this change">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* footer */}
          <div style={{ display: "flex", gap: 4, padding: 8, borderTop: `1px solid ${UI.border}`, background: UI.bg, flex: "none" }}>
            <button
              onClick={() => {
                onCopy();
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1100);
              }}
              style={{
                flex: 1,
                height: 28,
                cursor: "pointer",
                border: "none",
                background: copied ? UI.text : UI.mint,
                color: "#0b0b0e",
                fontWeight: 700,
                ...UI.mono,
                fontSize: 10,
                letterSpacing: "0.08em",
              }}
            >
              {copied ? `COPIED ▸ ${changes.length} CHANGE${changes.length === 1 ? "" : "S"}` : "COPY FOR AI"}
            </button>
            <button style={{ ...toolBtn(), height: 28 }} onClick={onResetAll}>
              reset
            </button>
          </div>
        </>
      )}
    </div>
  );
}
