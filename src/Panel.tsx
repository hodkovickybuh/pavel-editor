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
  winningRuleFor,
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
  tokensForProp,
  type NumProp,
} from "./selectors";
import { centring } from "./geometry";
import { bucketOf, bucketLabel, changeKey, store, type EditState } from "./store";
import { runAudit, type Finding } from "./audit";
import { csOf } from "./context";
import type { Change } from "./store";
import type { FrameSpec } from "./Frame";

export type Tab = "design" | "layers" | "changes" | "audit";
export type MoveMode = "push" | "isolate";

/* ------------------------------------------------------------- primitives */

/** one editable number inside the box-model diagram: click to type, esc cancels */
function BoxVal({
  value,
  changed,
  onSet,
  onSetRaw,
  title,
}: {
  value: number;
  changed: boolean;
  onSet: (v: number) => void;
  onSetRaw?: (v: string) => void;
  title: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft !== null) {
    return (
      <input
        autoFocus
        value={draft}
        title={title}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const t = draft.trim();
          if (t !== "" && Number.isFinite(Number(t))) onSet(Number(t));
          else if (onSetRaw && /^-?\d*\.?\d+(%|vw|vh|dvh|svh|lvh|vmin|vmax|rem|em|ch)$/.test(t)) onSetRaw(t);
          setDraft(null);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setDraft(null);
        }}
        style={{
          width: 34,
          height: 16,
          padding: 0,
          textAlign: "center",
          background: "rgba(10,8,14,0.5)",
          border: "1px solid var(--pe-blue)",
          borderRadius: 4,
          color: "var(--pe-text)",
          font: "inherit",
          fontSize: 10,
          fontFamily: "var(--pe-mono)",
        }}
      />
    );
  }
  return (
    <button
      title={`${title} · click to edit`}
      onClick={() => setDraft(String(value))}
      style={{
        minWidth: 22,
        padding: "0 3px",
        height: 16,
        border: "none",
        borderRadius: 4,
        cursor: "text",
        background: "transparent",
        color: changed ? "var(--pe-mint)" : "inherit",
        font: "inherit",
        fontSize: 10,
        fontFamily: "var(--pe-mono)",
        fontWeight: changed ? 700 : 500,
      }}
    >
      {value}
    </button>
  );
}

/**
 * The DevTools-style box model: margin, border, padding and the content box as
 * nested rectangles with every value editable in place. Replaces eight rows of
 * inputs with the picture everyone already knows how to read.
 */
function BoxModel({
  el,
  changedKeys,
  keyFor,
  onSet,
  onSetRaw,
}: {
  el: HTMLElement;
  changedKeys: Set<string>;
  keyFor: (prop: string) => string;
  onSet: (prop: NumProp, v: number) => void;
  onSetRaw: (prop: string, v: string) => void;
}) {
  const v = (p: NumProp) => readProp(el, p);
  const chg = (p: string) => changedKeys.has(keyFor(p));
  const cs = csOf(el);
  const bw = Math.round(parseFloat(cs.borderTopWidth) || 0);
  const r = el.getBoundingClientRect();

  const ring = (bg: string, border: string, label: string, top: React.ReactNode, right: React.ReactNode, bottom: React.ReactNode, left: React.ReactNode, child: React.ReactNode) => (
    <div style={{ background: bg, border, borderRadius: 6, padding: "2px 4px", display: "grid", gridTemplateColumns: "auto 1fr auto", gridTemplateRows: "auto 1fr auto", alignItems: "center", justifyItems: "center", gap: 1, position: "relative" }}>
      <span style={{ position: "absolute", top: 2, left: 6, fontSize: 9, color: "rgba(240,239,244,0.75)" }}>{label}</span>
      <span style={{ gridColumn: "1 / 4" }}>{top}</span>
      <span>{left}</span>
      <span style={{ width: "100%" }}>{child}</span>
      <span>{right}</span>
      <span style={{ gridColumn: "1 / 4" }}>{bottom}</span>
    </div>
  );

  return (
    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--pe-border)", fontFamily: "var(--pe-mono)", fontSize: 10, color: "var(--pe-text)" }}>
      {ring(
        "rgba(200,155,107,0.20)",
        "1px dashed rgba(200,155,107,0.6)",
        "margin",
        <BoxVal title="margin-top" value={v("margin-top")} changed={chg("margin-top")} onSet={(x) => onSet("margin-top", x)} onSetRaw={(x) => onSetRaw("margin-top", x)} />,
        <BoxVal title="margin-right" value={v("margin-right")} changed={chg("margin-right")} onSet={(x) => onSet("margin-right", x)} onSetRaw={(x) => onSetRaw("margin-right", x)} />,
        <BoxVal title="margin-bottom" value={v("margin-bottom")} changed={chg("margin-bottom")} onSet={(x) => onSet("margin-bottom", x)} onSetRaw={(x) => onSetRaw("margin-bottom", x)} />,
        <BoxVal title="margin-left" value={v("margin-left")} changed={chg("margin-left")} onSet={(x) => onSet("margin-left", x)} onSetRaw={(x) => onSetRaw("margin-left", x)} />,
        ring(
          "rgba(240,239,244,0.06)",
          "1px solid rgba(240,239,244,0.35)",
          "border",
          <span style={{ color: "var(--pe-faint)" }}>{bw}</span>,
          <span style={{ color: "var(--pe-faint)" }}>{bw}</span>,
          <span style={{ color: "var(--pe-faint)" }}>{bw}</span>,
          <span style={{ color: "var(--pe-faint)" }}>{bw}</span>,
          ring(
            "rgba(153,225,217,0.16)",
            "1px dashed rgba(153,225,217,0.55)",
            "padding",
            <BoxVal title="padding-top" value={v("padding-top")} changed={chg("padding-top")} onSet={(x) => onSet("padding-top", x)} onSetRaw={(x) => onSetRaw("padding-top", x)} />,
            <BoxVal title="padding-right" value={v("padding-right")} changed={chg("padding-right")} onSet={(x) => onSet("padding-right", x)} onSetRaw={(x) => onSetRaw("padding-right", x)} />,
            <BoxVal title="padding-bottom" value={v("padding-bottom")} changed={chg("padding-bottom")} onSet={(x) => onSet("padding-bottom", x)} onSetRaw={(x) => onSetRaw("padding-bottom", x)} />,
            <BoxVal title="padding-left" value={v("padding-left")} changed={chg("padding-left")} onSet={(x) => onSet("padding-left", x)} onSetRaw={(x) => onSetRaw("padding-left", x)} />,
            <div style={{ background: "rgba(178,213,229,0.22)", border: "1px solid rgba(178,213,229,0.6)", borderRadius: 5, padding: "3px 6px", display: "flex", alignItems: "center", justifyContent: "center", gap: 2, minHeight: 24 }}>
              <BoxVal title="width" value={Math.round(r.width)} changed={chg("width")} onSet={(x) => onSet("width", x)} onSetRaw={(x) => onSetRaw("width", x)} />
              ×
              <BoxVal title="height" value={Math.round(r.height)} changed={chg("height")} onSet={(x) => onSet("height", x)} onSetRaw={(x) => onSetRaw("height", x)} />
            </div>,
          ),
        ),
      )}
    </div>
  );
}

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
  tokens,
  onSet,
  onSetRaw,
  onResetKey,
}: {
  prop: NumProp;
  value: number;
  mixed: boolean;
  changed: boolean;
  el: HTMLElement;
  /** the design tokens this property may honestly borrow from */
  tokens: Array<{ name: string; px: number }>;
  onSet: (v: number) => void;
  /** a typed value carrying its own unit: 10vw, 50%, 3rem, 40dvh */
  onSetRaw: (v: string) => void;
  onResetKey?: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [tokOpen, setTokOpen] = useState(false);
  const scrub = useRef<{ startX: number; base: number; prevInline: string } | null>(null);
  const spec = PROPS[prop];

  const onScrubDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    // remember the pre-scrub INLINE value so the preview can be unwound before
    // committing: the store captures base by reading the element, and reading
    // it with the preview still applied recorded base == value, i.e. nothing
    scrub.current = { startX: e.clientX, base: value, prevInline: el.style.getPropertyValue(prop) };
    void 0;
  };
  const onScrubMove = (e: React.PointerEvent) => {
    const s = scrub.current;
    if (!s) return;
    const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const v = s.base + (e.clientX - s.startX) * spec.step * mult;
    // inline-important outranks the preview stylesheet's !important rules
    el.style.setProperty(prop, `${Math.max(spec.min, Math.round(v / spec.step) * spec.step)}${spec.unit}`, "important");
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

  // a value off the 4px scale is the tell that a page has no spacing system.
  // Said quietly, next to the number, at the moment it can still be fixed.
  const scaleOff =
    !mixed && value !== 0 && Math.abs(value % 4) > 0.001 && /^(margin|padding|gap|row-gap|column-gap)/.test(prop);
  const match = tokens.find((t) => Math.abs(t.px - value) < 0.51);

  return (
    <>
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
      {tokens.length > 0 && (
        <button
          className={`pe-btn sm${match ? " on" : ""}`}
          style={{ padding: "0 5px", fontSize: 10 }}
          title={match ? `this is var(${match.name}) · click for the other tokens` : "write a design token instead of a number"}
          onClick={() => setTokOpen((o) => !o)}
        >
          ◇
        </button>
      )}
      {scaleOff && (
        <span
          title={`${value}px is off the 4px scale · nearest ${Math.round(value / 4) * 4}`}
          style={{ width: 5, height: 5, borderRadius: 99, background: "var(--pe-warn)", flex: "none" }}
        />
      )}
      <input
        className={`pe-input val${changed ? " changed" : ""}`}
        value={draft ?? (mixed ? "mixed" : String(value))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null && draft !== "") {
            const t = draft.trim();
            // a plain number stays px; a unit suffix writes the raw value, so
            // responsive units (vw, %, dvh, rem...) are first-class
            if (Number.isFinite(Number(t))) onSet(Number(t));
            else if (/^-?\d*\.?\d+(%|vw|vh|dvh|svh|lvh|vmin|vmax|rem|em|ch|fr)$/.test(t)) onSetRaw(t);
          }
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
    {tokOpen && (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "2px 14px 8px 18px" }}>
        {tokens.map((t) => (
          <button
            key={t.name}
            className={`pe-btn sm${match?.name === t.name ? " on" : ""}`}
            style={{ fontFamily: "var(--pe-mono)", fontSize: 9.5, padding: "0 6px" }}
            title={`${t.name} = ${t.px}px`}
            onClick={() => {
              onSetRaw(`var(${t.name})`);
              setTokOpen(false);
            }}
          >
            {t.name.replace(/^--/, "")} <span style={{ color: "var(--pe-faint)" }}>{t.px}</span>
          </button>
        ))}
      </div>
    )}
    </>
  );
}

const RECENTS_KEY = "pe-recent-colors";
function pushRecent(v: string) {
  try {
    const cur: string[] = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
    localStorage.setItem(RECENTS_KEY, JSON.stringify([v, ...cur.filter((c) => c !== v)].slice(0, 8)));
  } catch {
    /* fine */
  }
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
  const set = (v: string) => {
    pushRecent(v);
    onSet(v);
  };
  const recents: string[] = useMemo(() => {
    try {
      return open ? JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]") : [];
    } catch {
      return [];
    }
  }, [open]);
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
          onChange={(e) => set(e.target.value)}
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
                set(res.sRGBHex);
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
          {recents.length > 0 && (
            <span style={{ gridColumn: "1 / -1", color: "var(--pe-faint)", fontSize: 9 }}>recent</span>
          )}
          {recents.map((c) => (
            <button key={"r" + c} className="pe-swatch" title={c} onClick={() => { set(c); setOpen(false); }} style={{ aspectRatio: "1", width: "100%", height: "auto", background: c }} />
          ))}
          {tokens.length > 0 && (
            <span style={{ gridColumn: "1 / -1", color: "var(--pe-faint)", fontSize: 9 }}>tokens</span>
          )}
          {tokens.map((t) => (
            <button
              key={t.name}
              className="pe-swatch"
              title={t.name}
              onClick={() => {
                set(t.value);
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

/** the complete keys and gestures sheet, openable any time via ? */
function KeysSheet() {
  const K = ({ k }: { k: string }) => <span className="pe-key">{k}</span>;
  const Row = ({ keys, children }: { keys: React.ReactNode; children: React.ReactNode }) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3px 0" }}>
      <span style={{ flex: "none", minWidth: 86 }}>{keys}</span>
      <span style={{ color: "var(--pe-dim)" }}>{children}</span>
    </div>
  );
  const H = ({ children }: { children: React.ReactNode }) => (
    <div style={{ color: "var(--pe-text)", fontWeight: 700, letterSpacing: "0.06em", margin: "14px 0 4px", fontSize: 11 }}>{children}</div>
  );
  return (
    <div style={{ padding: "6px 16px 16px", fontSize: 10.5, lineHeight: 1.6 }}>
      <H>SELECT</H>
      <Row keys={<>click</>}>select · <K k="⇧" />+click adds or removes</Row>
      <Row keys={<>drag empty</>}>box-select several things at once</Row>
      <Row keys={<>2× click</>}>on text: edit the words · on a group: enter it</Row>
      <Row keys={<><K k="←" /> <K k="→" /></>}>select the parent / the child</Row>
      <Row keys={<K k="esc" />}>deselect</Row>
      <Row keys={<><K k="⌘" />+click</>}>USE the page: follow a link, press a button</Row>
      <Row keys={<>✕ then ✎ EDIT</>}>pause the editor entirely, come back later</Row>

      <H>MOVE & RESIZE</H>
      <Row keys={<>drag</>}>move the selected thing (solo: only it moves)</Row>
      <Row keys={<><K k="⌥" />+drag</>}>free-roam: no snapping, no auto-reorder</Row>
      <Row keys={<>drag in a row</>}>inside a flex/grid row it REORDERS the cards</Row>
      <Row keys={<>drag edge</>}>right or bottom edge resizes, corner does both</Row>
      <Row keys={<><K k="↑" /> <K k="↓" /></>}>nudge 1px · <K k="⇧" /> makes it 10px</Row>
      <Row keys={<><K k="⌥" />+<K k="←" /> <K k="→" /></>}>nudge sideways (plain ←→ walk the tree)</Row>
      <Row keys={<K k="P" />}>solo ↔ push: what happens to content below</Row>

      <H>EDIT</H>
      <Row keys={<K k="⏎" />}>edit the selected text</Row>
      <Row keys={<K k="N" />}>pin a note to the selection</Row>
      <Row keys={<><K k="⌘C" /> <K k="⌘V" /></>}>copy one element's style onto another</Row>
      <Row keys={<K k="D" />}>duplicate (preview only)</Row>
      <Row keys={<K k="⌫" />}>hide (undoable)</Row>
      <Row keys={<>type units</>}>any number field takes 10vw · 50% · 40dvh · 3rem</Row>
      <Row keys={<>drag a label</>}>scrub its value · <K k="⇧" /> ×10 · <K k="⌥" /> fine</Row>
      <Row keys={<>drop a file</>}>onto any image to swap that image</Row>
      <Row keys={<><K k="⌘Z" /> <K k="⇧⌘Z" /></>}>undo · redo, one step per gesture</Row>

      <H>SEE</H>
      <Row keys={<>hover</>}>margins and padding shade automatically</Row>
      <Row keys={<><K k="⌥" />+hover</>}>distances from the selection to anything</Row>
      <Row keys={<><K k="S" /> <K k="C" /> <K k="G" /></>}>spacing bands · centring · 8px grid</Row>
      <Row keys={<>before/after</>}>flip the whole page to the original and back</Row>
      <Row keys={<K k="Tab" />}>sections mode: drag whole page sections</Row>
      <Row keys={<>✎ mark</>}>circle anything freehand, attach a note</Row>
      <Row keys={<K k="?" />}>open or close this sheet</Row>

      <H>THE TOOLBAR</H>
      <Row keys={<>▷ use the page</>}>hands the page back: open a menu or a modal, fill a form, then edit what appeared</Row>
      <Row keys={<>state</>}>edit hover, focus and active values · they are shown at rest while you work</Row>
      <Row keys={<>⏸ motion</>}>rehearse prefers-reduced-motion with every animation off</Row>
      <Row keys={<>◇</>}>on a number: write the design token instead of the px</Row>
      <Row keys={<>audit</>}>contrast, tap targets, alt text, focus, overflow, measure · click ◎ to jump to it</Row>
      <Row keys={<>save session</>}>hand the whole edit to someone else as a file</Row>
      <Row keys={<>the chip</>}>which breakpoint band your edits are being scoped to right now</Row>
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

  // the editor's own host node is a body child when the tree is rooted at body
  return (
    <div style={{ padding: "6px 0" }}>
      {[...root.children]
        .filter((c): c is HTMLElement => c.nodeType === 1 && !c.hasAttribute("data-editmode-ui"))
        .map((c) => render(c, 0))}
    </div>
  );
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
  onSetRaw,
  onSetStyle,
  onAlign,
  onDistribute,
  onDuplicate,
  onDelete,
  onNote,
  onOff,
  showKeys,
  setShowKeys,
  showingOriginal,
  onToggleOriginal,
  variantSaved,
  activeVariant,
  onVariant,
  frameSpec,
  onOpenFrame,
  onCloseFrame,
  root,
  setHover,
  tick,
  updateTo,
  refSkin,
  setRefSkin,
  interact,
  setInteract,
  editState,
  setEditState,
  reducedMotion,
  setReducedMotion,
  bridge,
  band,
  onImported,
}: {
  mode: "spacing" | "sections" | "mark";
  setMode: (m: "spacing" | "sections" | "mark") => void;
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
  onSetRaw: (prop: string, value: string) => void;
  onSetStyle: (prop: string, value: string) => void;
  onAlign: (edge: "left" | "centre" | "right") => void;
  onDistribute: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onNote: () => void;
  onOff: () => void;
  showKeys: boolean;
  setShowKeys: (v: boolean) => void;
  showingOriginal: boolean;
  onToggleOriginal: () => void;
  variantSaved: { A: boolean; B: boolean };
  activeVariant: "A" | "B" | null;
  onVariant: (slot: "A" | "B", save: boolean) => void;
  frameSpec: FrameSpec | null;
  onOpenFrame: () => void;
  onCloseFrame: () => void;
  root: HTMLElement | null;
  setHover: (el: HTMLElement | null) => void;
  tick: number;
  updateTo: string | null;
  refSkin: { url: string; opacity: number; on: boolean } | null;
  setRefSkin: (v: { url: string; opacity: number; on: boolean } | null) => void;
  interact: boolean;
  setInteract: (v: boolean) => void;
  editState: EditState;
  setEditState: (s: EditState) => void;
  reducedMotion: boolean;
  setReducedMotion: (v: boolean) => void;
  /** the bridge's working directory when one is listening */
  bridge: string | null;
  /** which breakpoint band the current viewport falls in, in words */
  band: string;
  onImported: (n: number) => void;
}) {
  void tick; // re-render trigger; the panel reads the live DOM each pass

  const primary = selection[0] ?? null;
  const reach = primary ? ruleReach(primary) : 1;
  // memoised: the panel re-renders on every scroll and every drag frame, and
  // this walks the whole document
  const matchCount = useMemo(() => (primary ? matchingElements(primary).length : 1), [primary]);
  const c = primary ? centring(primary) : null;
  const primaryPath = primary ? domPath(primary) : null;
  const changedKeys = useMemo(() => new Set(changes.map((ch) => ch.key)), [changes]);
  /** a prop's change identity at the CURRENT band and state */
  const keyFor = (prop: string) => (primaryPath ? changeKey(primaryPath, prop, bucketOf(), editState) : "");
  const tokens = useMemo(() => (primary ? colorTokens() : []), [primary]);
  const numTokens = useMemo(() => (primary ? store.tokens() : []), [primary]);
  const fonts = useMemo(() => (primary ? loadedFonts() : []), [primary]);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const audit = () => setFindings(runAudit());

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

  const groupHasChange = (props: readonly string[]) => props.some((p) => changedKeys.has(keyFor(p)));

  const place: React.CSSProperties = pos ? { top: pos.y, left: pos.x } : { top: 12, right: 12 };

  return (
    <div ref={panelRef} data-editmode-ui="" className="pe-panel" style={place}>
      {/* header */}
      <div className="pe-head" onPointerDown={onHeadDown} onPointerMove={onHeadMove} onPointerUp={onHeadUp}>
        <span className="pe-title">
          <b>PAVEL</b> EDITOR
        </span>
        <span className="pe-chip" title={`edits made now are scoped to ${band}`}>
          {frameSpec ? `${frameSpec.w}×${frameSpec.h}` : band}
        </span>
        <span style={{ flex: 1 }} />
        <button className={`pe-help${showKeys ? " on" : ""}`} onClick={() => setShowKeys(!showKeys)} title="keys & gestures · ?">
          ?
        </button>
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
              <button className={mode === "mark" ? "on" : ""} onClick={() => setMode("mark")} title="circle anything on the page and attach a note to it, review-style">
                ✎ mark
              </button>
            </div>
            <button className={`pe-btn${frameSpec ? " on" : ""}`} onClick={() => (frameSpec ? onCloseFrame() : onOpenFrame())} title="preview and edit at a real device size">
              ▢ device
            </button>
            <button
              className={`pe-btn${interact ? " on" : ""}`}
              onClick={() => setInteract(!interact)}
              title="hand the page back: open a menu, submit a form, run a carousel, then turn this off and edit what you see"
            >
              {interact ? "◉ using the page" : "▷ use the page"}
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

          {/* view toggles + compare */}
          <div style={{ display: "flex", gap: 6, padding: "10px 14px", borderBottom: "1px solid var(--pe-border)", flex: "none", alignItems: "center" }}>
            <button className={`pe-btn${showSpacing ? " on" : ""}`} onClick={() => setShowSpacing(!showSpacing)} title="S · show margin and padding bands">
              spacing
            </button>
            <button className={`pe-btn${showCentring ? " on" : ""}`} onClick={() => setShowCentring(!showCentring)} title="C · centring readout">
              centring
            </button>
            <button className={`pe-btn${showGrid ? " on" : ""}`} onClick={() => setShowGrid(!showGrid)} title="G · 8px grid">
              grid
            </button>
            <button
              className={`pe-btn${reducedMotion ? " on" : ""}`}
              onClick={() => setReducedMotion(!reducedMotion)}
              title="rehearse prefers-reduced-motion: every transition and animation off, so the still page can be judged"
            >
              ⏸ motion
            </button>
            <span style={{ flex: 1 }} />
            <button className={`pe-btn${showingOriginal ? " on" : ""}`} onClick={onToggleOriginal} title="flip the whole page between BEFORE (original) and AFTER (your edits)">
              {showingOriginal ? "original ◉" : "before/after"}
            </button>
          </div>

          {/* the state being edited: a hover value is a design decision too */}
          <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: "1px solid var(--pe-border)", flex: "none", alignItems: "center" }}>
            <span style={{ color: "var(--pe-faint)", fontSize: 10.5 }}>state</span>
            <div className="pe-seg">
              {([
                ["", "rest"],
                ["hover", "hover"],
                ["focus-visible", "focus"],
                ["active", "active"],
              ] as Array<[EditState, string]>).map(([s, label]) => (
                <button key={label} className={editState === s ? "on" : ""} onClick={() => setEditState(s)} title={s ? `edit the ${s} values · they are shown at rest while you do` : "the resting values"}>
                  {label}
                </button>
              ))}
            </div>
            {editState && <span style={{ color: "var(--pe-violet)", fontSize: 10 }}>shown at rest</span>}
          </div>

          {/* variants */}
          <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: "1px solid var(--pe-border)", flex: "none", alignItems: "center" }}>
            <span style={{ color: "var(--pe-faint)", fontSize: 10.5 }}>variants</span>
            <div className="pe-seg">
              {(["A", "B"] as const).map((slot) => (
                <button
                  key={slot}
                  className={activeVariant === slot ? "on" : ""}
                  onClick={() => onVariant(slot, false)}
                  title={variantSaved[slot] ? `load variant ${slot} · alt+click overwrites it with the current state` : `save the current state as variant ${slot}`}
                  onAuxClick={() => onVariant(slot, true)}
                  onClickCapture={(e) => {
                    if (e.altKey) {
                      e.stopPropagation();
                      onVariant(slot, true);
                    }
                  }}
                >
                  {slot}
                  {variantSaved[slot] ? "" : " +"}
                </button>
              ))}
            </div>
            <span style={{ color: "var(--pe-faint)", fontSize: 10 }}>save two directions, click to compare</span>
          </div>

          {/* tabs */}
          <div className="pe-tabs">
            {(["design", "layers", "changes", "audit"] as Tab[]).map((t) => (
              <button
                key={t}
                className={`pe-tab${tab === t ? " on" : ""}`}
                onClick={() => {
                  setTab(t);
                  if (t === "audit" && !findings) audit();
                }}
              >
                {t}
                {t === "changes" && changes.length ? <span className="n">{changes.length}</span> : null}
                {t === "audit" && findings?.length ? <span className="n">{findings.length}</span> : null}
              </button>
            ))}
          </div>

          <div className="pe-scroll">
            {showKeys && <KeysSheet />}
            {!showKeys && tab === "design" && !primary && (
              <div style={{ padding: "14px 16px", color: "var(--pe-dim)", fontSize: 10.5, lineHeight: 2.1 }}>
                <div style={{ color: "var(--pe-text)", fontWeight: 700, marginBottom: 6, letterSpacing: "0.06em" }}>START</div>
                click anything to select it
                <br />
                drag a box to select several
                <br />
                drag a selected thing to <span style={{ color: "var(--pe-blue)" }}>move</span> it
                <br />
                drag its right or bottom edge to <span style={{ color: "var(--pe-blue)" }}>resize</span>
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
                <br />
                <br />
                press <span className="pe-key">?</span> for EVERY key and gesture
              </div>
            )}

            {!showKeys && tab === "design" && primary && (
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
                  {(() => {
                    const d = describe(primary);
                    if (d.file) return null;
                    const w = winningRuleFor(primary, "display");
                    if (!w) return null;
                    return (
                      <div style={{ color: "var(--pe-faint)", marginTop: 3, fontSize: 9.5 }}>
                        rule: <span style={{ color: "var(--pe-dim)" }}>{w.selector}</span> · {w.file}
                      </div>
                    );
                  })()}
                  {reach > 1 && (
                    <div style={{ color: "var(--pe-warn)", marginTop: 4, fontSize: 9.5 }}>shared rule · styling {reach} elements on this page</div>
                  )}
                  {matchCount > 1 && (
                    <label style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6, cursor: "pointer", fontSize: 10.5 }}>
                      <input type="checkbox" checked={scopeAll} onChange={(e) => setScopeAll(e.target.checked)} style={{ accentColor: "var(--pe-blue)" }} />
                      <span style={{ color: scopeAll ? "var(--pe-blue)" : "var(--pe-dim)" }}>edit all {matchCount} matching</span>
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

                {/* the box model replaces the spacing and padding row-groups */}
                <BoxModel el={primary} changedKeys={changedKeys} keyFor={keyFor} onSet={onSet} onSetRaw={onSetRaw} />

                {/* numeric groups */}
                {GROUPS.filter((g) => g.title !== "spacing" && g.title !== "padding").map((g) => {
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
                                changed={changedKeys.has(keyFor(prop))}
                                el={primary}
                                tokens={tokensForProp(prop, numTokens)}
                                onSet={(v) => onSet(prop, v)}
                                onSetRaw={(v) => onSetRaw(prop, v)}
                                onResetKey={() => primaryPath && onResetOne(keyFor(prop))}
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

            {!showKeys && tab === "layers" && <Layers root={root} selection={selection} onPick={(el) => setSelection([el])} onHover={setHover} />}

            {!showKeys && tab === "audit" && (
              <div style={{ padding: "8px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px 8px" }}>
                  <button className="pe-btn" onClick={audit} title="re-run every check at the current width">
                    ↻ run checks
                  </button>
                  <span style={{ color: "var(--pe-faint)", fontSize: 10 }}>
                    {findings ? `${findings.filter((f) => f.level === "fail").length} fail · ${findings.filter((f) => f.level === "warn").length} warn` : "contrast, targets, alt, focus, overflow, measure"}
                  </span>
                </div>
                {findings && !findings.length && (
                  <span style={{ color: "var(--pe-mint)", padding: "0 14px" }}>nothing failed at this width. Check the phone width too.</span>
                )}
                {findings?.map((f, i) => (
                  <div key={i} className="pe-change" style={{ borderLeftColor: f.level === "fail" ? "var(--pe-warn)" : "var(--pe-border-hi)" }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 10 }}>
                      <div style={{ color: f.level === "fail" ? "var(--pe-warn)" : "var(--pe-dim)", fontWeight: 600 }}>{f.rule}</div>
                      <div style={{ color: "var(--pe-text)", wordBreak: "break-word" }}>{f.msg}</div>
                    </div>
                    {f.el && (
                      <button
                        className="pe-btn sm"
                        title="select the element"
                        onMouseEnter={() => setHover(f.el)}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => {
                          setSelection([f.el!]);
                          f.el!.scrollIntoView({ block: "center", behavior: "smooth" });
                        }}
                      >
                        ◎
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!showKeys && tab === "changes" && (
              <div style={{ padding: "10px 0" }}>
                {!changes.length && <span style={{ color: "var(--pe-faint)", padding: "0 14px" }}>no changes yet · everything you edit lands here</span>}
                {changes.length > 0 && (
                  <div style={{ display: "flex", gap: 6, padding: "0 14px 8px" }}>
                    <button
                      className="pe-btn sm"
                      title="save this session as a file someone else can load on their machine"
                      onClick={() => {
                        const blob = new Blob([store.exportSession()], { type: "application/json" });
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(blob);
                        a.download = `pavel-editor-${location.pathname.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "page"}.json`;
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                      }}
                    >
                      ⤓ save session
                    </button>
                    <label className="pe-btn sm" style={{ cursor: "pointer" }}>
                      ⤒ load
                      <input
                        type="file"
                        accept="application/json"
                        style={{ display: "none" }}
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          onImported(store.importSession(await f.text()));
                        }}
                      />
                    </label>
                  </div>
                )}
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
                          <span className="mono">
                            {ch.prop}
                            {ch.state ? <span style={{ color: "var(--pe-violet)" }}>:{ch.state}</span> : null}:{" "}
                            <span style={{ color: "var(--pe-blue)" }}>{ch.value}</span>{" "}
                            <span style={{ color: "var(--pe-faint)" }}>was {ch.base}</span>
                            {ch.bucket && <span style={{ color: "var(--pe-dim)" }}> · {bucketLabel(ch.bucket)}</span>}
                            {ch.tok && <span style={{ color: "var(--pe-mint)" }}> = var({ch.tok})</span>}
                            {ch.rival && (
                              <span style={{ color: "var(--pe-warn)" }} title={`"${ch.rival}" already sets this and is at least as specific. Applied as a plain rule this value will lose; the report says so.`}>
                                {" "}
                                ⚠ cascade
                              </span>
                            )}
                          </span>
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

          {/* onion skin: drop a mock over the page and match it by eye */}
          <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderTop: "1px solid var(--pe-border)", alignItems: "center", flex: "none" }}>
            <span style={{ color: "var(--pe-faint)", fontSize: 10.5, flex: "none" }}>reference</span>
            <label className="pe-btn sm" style={{ cursor: "pointer" }}>
              {refSkin ? "replace" : "load a mock…"}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (refSkin) URL.revokeObjectURL(refSkin.url);
                  setRefSkin({ url: URL.createObjectURL(f), opacity: 0.5, on: true });
                }}
              />
            </label>
            {refSkin && (
              <>
                <button className={`pe-btn sm${refSkin.on ? " on" : ""}`} onClick={() => setRefSkin({ ...refSkin, on: !refSkin.on })}>
                  {refSkin.on ? "shown" : "hidden"}
                </button>
                <input
                  type="range"
                  min={5}
                  max={95}
                  value={Math.round(refSkin.opacity * 100)}
                  onChange={(e) => setRefSkin({ ...refSkin, opacity: Number(e.target.value) / 100 })}
                  style={{ flex: 1, accentColor: "var(--pe-blue)" }}
                />
                <button className="pe-btn sm" onClick={() => setRefSkin(null)}>✕</button>
              </>
            )}
          </div>

          {updateTo && (
            <div className="pe-update">
              <span>v{updateTo} is out</span>
              <a href="https://github.com/hodkovickybuh/pavel-editor/releases/latest/download/pavel-editor-extension.zip" target="_blank" rel="noreferrer">
                ⬇ download
              </a>
              <span style={{ color: "var(--pe-dim)" }}>then re-drag the folder in chrome://extensions</span>
            </div>
          )}

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
              {copied
                ? bridge
                  ? `SENT ▸ ${changes.length} CHANGE${changes.length === 1 ? "" : "S"}`
                  : `COPIED ▸ ${changes.length} CHANGE${changes.length === 1 ? "" : "S"}`
                : bridge
                  ? "APPLY TO CODE"
                  : "COPY FOR AI"}
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
