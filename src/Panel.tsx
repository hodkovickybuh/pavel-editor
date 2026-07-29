"use client";

/**
 * The control panel. Layout and behaviour live here; the LOOK lives in
 * styles.ts, injected once and scoped under [data-editmode-ui], because hover,
 * focus and transition states cannot be expressed inline and they are the
 * difference between an instrument and a form. The editor still never adds
 * classes to the PAGE's elements, only to its own UI, so the class lists it
 * inspects stay clean.
 *
 * NO key={tick} on the root. The panel re-renders from props; remounting it per
 * tick destroyed its scroll position on every page scroll.
 */

import { useMemo, useRef, useState } from "react";
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

export type Tab = "design" | "layers" | "changes";
export type MoveMode = "push" | "isolate";

/* ------------------------------------------------------------- primitives */

function GroupHead({
  title,
  open,
  hasChanges,
  onToggle,
}: {
  title: string;
  open: boolean;
  hasChanges: boolean;
  onToggle: () => void;
}) {
  return (
    <button className="pe-group-head" onClick={onToggle}>
      <span className="tw" style={{ transform: open ? "rotate(90deg)" : "none" }}>
        ▶
      </span>
      {title}
      {hasChanges && <span className="dot" title="this group holds edited values" />}
    </button>
  );
}

/**
 * A numeric row: scrubbable label (drag it like a Figma input; shift x10, alt
 * fine), exact input, changed-state tick. Scrubbing previews directly and
 * commits once on release, so a whole scrub is one undo step.
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
  const scrub = useRef<{ startX: number; base: number; prevInline: string } | null>(null);
  const spec = PROPS[prop];

  const onScrubDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    // remember the pre-scrub INLINE value so the preview can be unwound before
    // committing: the store captures base by reading the element, and reading
    // it with the preview still applied recorded base == value, i.e. nothing
    scrub.current = { startX: e.clientX, base: value, prevInline: el.style.getPropertyValue(prop) };
  };
  const onScrubMove = (e: React.PointerEvent) => {
    const s = scrub.current;
    if (!s) return;
    const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const v = s.base + (e.clientX - s.startX) * spec.step * mult;
    el.style.setProperty(prop, `${Math.max(spec.min, Math.round(v / spec.step) * spec.step)}${spec.unit}`);
  };
  const onScrubUp = (e: React.PointerEvent) => {
    const s = scrub.current;
    scrub.current = null;
    if (!s) return;
    if (s.prevInline) el.style.setProperty(prop, s.prevInline);
    else el.style.removeProperty(prop);
    const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const v = s.base + (e.clientX - s.startX) * spec.step * mult;
    if (Math.abs(v - s.base) > 0.001) onSet(v);
  };

  return (
    <div className="pe-row">
      {changed && <button className="pe-tick" title="edited · click to reset" onClick={onResetKey} />}
      <span
        className="lbl scrub"
        onPointerDown={onScrubDown}
        onPointerMove={onScrubMove}
        onPointerUp={onScrubUp}
        title="drag to scrub · shift x10 · alt fine"
      >
        {prop}
      </span>
      <input
        className={`pe-input val${changed ? " changed" : ""}`}
        value={draft ?? (mixed ? "mixed" : String(value))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
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
      <div className="pe-row">
        <span className="lbl">{label}</span>
        <button
          className="pe-swatch"
          onClick={() => setOpen((o) => !o)}
          title="design tokens"
          style={{ background: value, borderColor: open ? "var(--pe-mint)" : undefined }}
        />
        <input
          type="color"
          value={hex}
          onChange={(e) => onSet(e.target.value)}
          style={{ width: 22, height: 18, padding: 0, border: "1px solid var(--pe-border)", background: "transparent", cursor: "pointer" }}
        />
        {hasEyedropper && (
          <button
            className="pe-btn sm"
            title="sample a colour from the page"
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
        <span style={{ marginLeft: "auto", color: "var(--pe-faint)", fontSize: 9 }}>{hex}</span>
      </div>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 5, padding: "4px 14px 10px" }}>
          {tokens.length === 0 && (
            <span style={{ color: "var(--pe-faint)", gridColumn: "1 / -1", fontSize: 9 }}>no design tokens found on this site</span>
          )}
          {tokens.map((t) => (
            <button
              key={t.name}
              className="pe-swatch"
              title={t.name}
              onClick={() => {
                onSet(t.value);
                setOpen(false);
              }}
              style={{ aspectRatio: "1", width: "100%", height: "auto", background: t.value }}
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
    <div className="pe-row">
      <span className="lbl">{label}</span>
      <select className="pe-select" style={{ flex: 1, minWidth: 0 }} value={value} onChange={(e) => onSet(e.target.value)} onKeyDown={(e) => e.stopPropagation()}>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o.length > 28 ? `${o.slice(0, 28)}…` : o}
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
    <div className="pe-row">
      <span className="lbl">{label}</span>
      <input
        className="pe-input"
        style={{ flex: 1, minWidth: 0 }}
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
  if (!root) return <span style={{ color: "var(--pe-faint)", padding: 14, display: "block" }}>no page root found</span>;

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
          className={`pe-layer${selected ? " sel" : ""}`}
          style={{ paddingLeft: 10 + depth * 11 }}
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
            style={{ width: 12, border: "none", background: "transparent", color: "var(--pe-faint)", cursor: "pointer", padding: 0, font: "inherit", fontSize: 8 }}
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
              font: "inherit",
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

  return <div style={{ padding: "6px 0" }}>{[...root.children].filter((c): c is HTMLElement => c.nodeType === 1).map((c) => render(c, 0))}</div>;
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
  void tick; // re-render trigger; the panel reads the live DOM each pass

  const primary = selection[0] ?? null;
  const reach = primary ? ruleReach(primary) : 1;
  const matchCount = primary ? matchingElements(primary).length : 1;
  const c = primary ? centring(primary) : null;
  const primaryPath = primary ? domPath(primary) : null;
  const changedKeys = useMemo(() => new Set(changes.map((ch) => ch.key)), [changes]);
  const tokens = useMemo(() => (primary ? colorTokens() : []), [primary]);
  const fonts = useMemo(() => (primary ? loadedFonts() : []), [primary]);

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("pe-open-groups");
      if (raw) return new Set(JSON.parse(raw));
    } catch {
      /* default below */
    }
    return new Set(["spacing", "typography"]);
  });
  const toggleGroup = (g: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      try {
        localStorage.setItem("pe-open-groups", JSON.stringify([...next]));
      } catch {
        /* fine */
      }
      return next;
    });

  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem("pe-panel-pos");
      if (raw) return JSON.parse(raw);
    } catch {
      /* default */
    }
    return null;
  });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
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
    setPos({
      x: Math.min(window.innerWidth - 60, Math.max(0, e.clientX - d.dx)),
      y: Math.min(window.innerHeight - 40, Math.max(0, e.clientY - d.dy)),
    });
  };
  const onHeadUp = () => {
    if (dragRef.current && pos) {
      try {
        localStorage.setItem("pe-panel-pos", JSON.stringify(pos));
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

  const groupHasChange = (props: readonly string[]) =>
    !!primaryPath && props.some((p) => changedKeys.has(`${primaryPath}|${p}`));

  const place: React.CSSProperties = pos ? { top: pos.y, left: pos.x } : { top: 12, right: 12 };

  return (
    <div ref={panelRef} data-editmode-ui="" className="pe-panel" style={place}>
      {/* header */}
      <div className="pe-head" onPointerDown={onHeadDown} onPointerMove={onHeadMove} onPointerUp={onHeadUp}>
        <span className="pe-title">
          <b>PAVEL</b> EDITOR
        </span>
        <span className="pe-chip">{frameSpec ? `${frameSpec.w}×${frameSpec.h}` : "desktop"}</span>
        <span style={{ flex: 1 }} />
        <button className="pe-btn sm" onClick={onUndo} disabled={!canUndo} title="undo · cmd+Z">
          ↶
        </button>
        <button className="pe-btn sm" onClick={onRedo} disabled={!canRedo} title="redo · shift+cmd+Z">
          ↷
        </button>
        <button className="pe-btn sm" onClick={() => setMinimised((m) => !m)} title="collapse">
          {minimised ? "▢" : "—"}
        </button>
        <button className="pe-btn sm" onClick={onOff} title="hide · an EDIT pill stays in the corner">
          ✕
        </button>
      </div>

      {!minimised && (
        <>
          {/* modes */}
          <div style={{ display: "flex", gap: 6, padding: "10px 14px", borderBottom: "1px solid var(--pe-border)", flexWrap: "wrap", flex: "none", alignItems: "center" }}>
            <div className="pe-seg">
              <button className={mode === "spacing" ? "on" : ""} onClick={() => setMode("spacing")} title="edit elements">
                edit
              </button>
              <button className={mode === "sections" ? "on" : ""} onClick={() => setMode("sections")} title="Tab · drag whole sections to reorder the page">
                sections
              </button>
            </div>
            <button className={`pe-btn${frameSpec ? " on" : ""}`} onClick={() => (frameSpec ? onCloseFrame() : onOpenFrame())} title="preview and edit at a real device size">
              ▢ device
            </button>
            <span style={{ flex: 1 }} />
            <div className="pe-seg" title="P · what happens to the content BELOW when you move something">
              <button className={moveMode === "isolate" ? "on" : ""} onClick={() => setMoveMode("isolate")} title="move only this element; everything below stays put (like Figma)">
                solo
              </button>
              <button className={moveMode === "push" ? "on" : ""} onClick={() => setMoveMode("push")} title="honest CSS: moving this pushes everything below it down too">
                push
              </button>
            </div>
          </div>

          {/* view toggles */}
          <div style={{ display: "flex", gap: 6, padding: "10px 14px", borderBottom: "1px solid var(--pe-border)", flex: "none" }}>
            <button className={`pe-btn${showSpacing ? " on" : ""}`} onClick={() => setShowSpacing(!showSpacing)} title="S · show margin (orange) and padding (green) bands">
              spacing
            </button>
            <button className={`pe-btn${showCentring ? " on" : ""}`} onClick={() => setShowCentring(!showCentring)} title="C · shows whether the selection is centred, and by how much it is off">
              centring
            </button>
            <button className={`pe-btn${showGrid ? " on" : ""}`} onClick={() => setShowGrid(!showGrid)} title="G · an 8px baseline grid">
              grid
            </button>
          </div>

          {/* tabs */}
          <div className="pe-tabs">
            {(["design", "layers", "changes"] as Tab[]).map((t) => (
              <button key={t} className={`pe-tab${tab === t ? " on" : ""}`} onClick={() => setTab(t)}>
                {t}
                {t === "changes" && changes.length ? <span className="n">{changes.length}</span> : null}
              </button>
            ))}
          </div>

          <div className="pe-scroll">
            {tab === "design" && !primary && (
              <div style={{ padding: "14px 16px", color: "var(--pe-dim)", fontSize: 10.5, lineHeight: 2.1 }}>
                <div style={{ color: "var(--pe-text)", fontWeight: 700, marginBottom: 6, letterSpacing: "0.06em" }}>START</div>
                click anything to select it
                <br />
                drag a box to select several
                <br />
                drag a selected thing to <span style={{ color: "var(--pe-mint)" }}>move</span> it
                <br />
                drag its right or bottom edge to <span style={{ color: "var(--pe-mint)" }}>resize</span>
                <br />
                <div style={{ color: "var(--pe-text)", fontWeight: 700, margin: "12px 0 6px", letterSpacing: "0.06em" }}>KEYS</div>
                <span className="pe-key">⏎</span> edit text&nbsp;&nbsp;<span className="pe-key">N</span> pin a note
                <br />
                <span className="pe-key">⌘Z</span> undo&nbsp;&nbsp;<span className="pe-key">⌘C</span>/<span className="pe-key">⌘V</span> copy style
                <br />
                <span className="pe-key">⌥</span>+hover measures distances
                <br />
                <span className="pe-key">esc</span> deselect&nbsp;&nbsp;<span className="pe-key">←</span>
                <span className="pe-key">→</span> walk the tree
              </div>
            )}

            {tab === "design" && primary && (
              <>
                {/* identity */}
                <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--pe-border)" }}>
                  <div style={{ marginBottom: 4, fontSize: 9.5, lineHeight: 1.9 }}>
                    {crumbs.map((el, i) => (
                      <span key={i}>
                        <button
                          className={`pe-crumb${el === primary ? " on" : ""}`}
                          onClick={() => setSelection([el])}
                          onMouseEnter={() => setHover(el)}
                          onMouseLeave={() => setHover(null)}
                        >
                          {describe(el).selector.split(" ").pop()}
                        </button>
                        {i < crumbs.length - 1 && <span style={{ color: "var(--pe-faint)" }}> › </span>}
                      </span>
                    ))}
                  </div>
                  <div style={{ color: "var(--pe-violet)", fontWeight: 700, fontSize: 11.5 }}>
                    {selection.length > 1 ? `${selection.length} selected` : describe(primary).label}
                  </div>
                  {reach > 1 && (
                    <div style={{ color: "var(--pe-warn)", marginTop: 4, fontSize: 9.5 }}>shared rule · styling {reach} elements on this page</div>
                  )}
                  {matchCount > 1 && (
                    <label style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6, cursor: "pointer", fontSize: 10.5 }}>
                      <input type="checkbox" checked={scopeAll} onChange={(e) => setScopeAll(e.target.checked)} style={{ accentColor: "var(--pe-mint)" }} />
                      <span style={{ color: scopeAll ? "var(--pe-mint)" : "var(--pe-dim)" }}>edit all {matchCount} matching</span>
                    </label>
                  )}
                </div>

                {/* position */}
                {c && (
                  <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--pe-border)", fontSize: 10, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ color: c.centeredX ? "var(--pe-mint)" : "var(--pe-warn)", fontWeight: 700 }}>
                      {c.centeredX ? "◄ centred ►" : `off centre ${c.offsetX > 0 ? "+" : ""}${c.offsetX}px`}
                    </span>
                    <span style={{ color: "var(--pe-dim)" }}>
                      L{c.leftGap} R{c.rightGap} T{c.topGap} B{c.bottomGap}
                    </span>
                  </div>
                )}

                {selection.length > 1 && (
                  <div style={{ display: "flex", gap: 6, padding: "10px 14px", borderBottom: "1px solid var(--pe-border)" }}>
                    <button className="pe-btn" onClick={() => onAlign("left")} title="align left edges">
                      ⇤
                    </button>
                    <button className="pe-btn" onClick={() => onAlign("centre")} title="centre in parent">
                      ⇹
                    </button>
                    <button className="pe-btn" onClick={() => onAlign("right")} title="align right edges">
                      ⇥
                    </button>
                    <button className="pe-btn" onClick={onDistribute} title="make the vertical gaps equal">
                      ≡ even gaps
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
                      <GroupHead title={g.title} open={open} hasChanges={groupHasChange(props)} onToggle={() => toggleGroup(g.title)} />
                      {open && (
                        <div style={{ padding: "5px 0", borderBottom: "1px solid var(--pe-border)" }}>
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
                      <GroupHead title={g.title} open={open} hasChanges={groupHasChange(props)} onToggle={() => toggleGroup(g.title)} />
                      {open && (
                        <div style={{ padding: "5px 0", borderBottom: "1px solid var(--pe-border)" }}>
                          {props.map((prop) => {
                            const spec = STYLE_PROPS[prop];
                            if (!spec) return null;
                            const value = readStyle(primary, prop);
                            if (spec.kind === "color")
                              return <ColorRow key={prop} label={spec.label} value={value} tokens={tokens} onSet={(v) => onSetStyle(prop, v)} />;
                            if (spec.kind === "enum")
                              return (
                                <EnumRow
                                  key={prop}
                                  label={spec.label}
                                  value={value}
                                  options={prop === "font-family" ? fonts : spec.options}
                                  onSet={(v) => onSetStyle(prop, v)}
                                />
                              );
                            return <TextRow key={prop} label={spec.label} value={value} placeholder={spec.placeholder} onSet={(v) => onSetStyle(prop, v)} />;
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                <div style={{ display: "flex", gap: 6, padding: "10px 14px" }}>
                  <button className="pe-btn" onClick={onNote} title="N · pin a design note, exported with the report">
                    ✎ note
                  </button>
                  <button className="pe-btn" onClick={onDuplicate} title="D · preview only, refresh removes it">
                    ⧉ duplicate
                  </button>
                  <button className="pe-btn" onClick={onDelete} title="⌫ · sets display none, undoable">
                    ⌦ hide
                  </button>
                </div>
              </>
            )}

            {tab === "layers" && <Layers root={root} selection={selection} onPick={(el) => setSelection([el])} onHover={setHover} />}

            {tab === "changes" && (
              <div style={{ padding: "10px 0" }}>
                {!changes.length && <span style={{ color: "var(--pe-faint)", padding: "0 14px" }}>no changes yet · everything you edit lands here</span>}
                {changes.map((ch) => (
                  <div key={ch.key} className={`pe-change${ch.prop === "note" ? " note" : ""}`}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 10 }}>
                      <div style={{ color: "var(--pe-text)" }}>{ch.label}</div>
                      <div style={{ color: "var(--pe-dim)", wordBreak: "break-word" }}>
                        {ch.prop === "order" ? (
                          ch.value.split("\n").join(" → ")
                        ) : ch.prop === "note" ? (
                          <span style={{ color: "var(--pe-violet)" }}>{ch.value}</span>
                        ) : (
                          <>
                            {ch.prop}: <span style={{ color: "var(--pe-mint)" }}>{ch.value}</span>{" "}
                            <span style={{ color: "var(--pe-faint)" }}>was {ch.base}</span>
                            {(ch.vw ?? 1440) <= 900 && <span style={{ color: "var(--pe-warn)" }}> @{ch.vw}px</span>}
                          </>
                        )}
                      </div>
                    </div>
                    <button className="pe-btn sm" onClick={() => onResetOne(ch.key)} title="reset this change">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* footer */}
          <div style={{ display: "flex", gap: 6, padding: 10, borderTop: "1px solid var(--pe-border)", flex: "none" }}>
            <button
              className={`pe-cta${copied ? " done" : ""}`}
              onClick={() => {
                onCopy();
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? `COPIED ▸ ${changes.length} CHANGE${changes.length === 1 ? "" : "S"}` : "COPY FOR AI"}
            </button>
            <button className="pe-btn" style={{ height: 32 }} onClick={onResetAll}>
              reset
            </button>
          </div>
        </>
      )}
    </div>
  );
}
