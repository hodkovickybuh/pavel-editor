"use client";

/**
 * Everything drawn ON the page: hover and selection outlines, the marquee box,
 * snap guides, centring lines, measurement spans and the spacing visualisation.
 *
 * Pure render. It measures elements itself on every paint rather than taking
 * cached rects, because the page scrolls, animates and reflows underneath it,
 * and a cached rect shows an outline floating next to the thing it describes.
 * The parent re-renders it on scroll, resize and during drags.
 */

import { csOf } from "./context";
import type { Box, Guide, Span } from "./geometry";
import { centring } from "./geometry";
import { shortLabel } from "./selectors";

export const COLOR = {
  hover: "#4ade80",
  select: "#3b82f6",
  section: "#a78bfa",
  measure: "#f472b6",
  guide: "#f472b6",
  margin: "rgba(251,146,60,0.28)",
  padding: "rgba(74,222,128,0.24)",
  warn: "#fbbf24",
};

const base: React.CSSProperties = {
  position: "fixed",
  pointerEvents: "none",
  zIndex: 2147482000,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 10,
  lineHeight: 1.4,
};

function Chip({ x, y, text, bg }: { x: number; y: number; text: string; bg: string }) {
  return (
    <div
      style={{
        ...base,
        top: Math.max(2, y),
        left: Math.max(2, x),
        padding: "1px 5px",
        whiteSpace: "nowrap",
        background: bg,
        color: "#0b0b0b",
        fontWeight: 700,
      }}
    >
      {text}
    </div>
  );
}

/** margin (orange) and padding (green) drawn as bands, the DevTools convention */
function SpacingBands({ el }: { el: HTMLElement }) {
  const r = el.getBoundingClientRect();
  const cs = csOf(el);
  const f = (v: string) => parseFloat(v) || 0;
  const m = { t: f(cs.marginTop), b: f(cs.marginBottom), l: f(cs.marginLeft), r: f(cs.marginRight) };
  const p = { t: f(cs.paddingTop), b: f(cs.paddingBottom), l: f(cs.paddingLeft), r: f(cs.paddingRight) };
  const band = (s: React.CSSProperties, bg: string) => ({ ...base, ...s, background: bg });
  return (
    <>
      {m.t > 0 && <div style={band({ top: r.top - m.t, left: r.left, width: r.width, height: m.t }, COLOR.margin)} />}
      {m.b > 0 && <div style={band({ top: r.bottom, left: r.left, width: r.width, height: m.b }, COLOR.margin)} />}
      {m.l > 0 && <div style={band({ top: r.top, left: r.left - m.l, width: m.l, height: r.height }, COLOR.margin)} />}
      {m.r > 0 && <div style={band({ top: r.top, left: r.right, width: m.r, height: r.height }, COLOR.margin)} />}
      {p.t > 0 && <div style={band({ top: r.top, left: r.left, width: r.width, height: p.t }, COLOR.padding)} />}
      {p.b > 0 && <div style={band({ top: r.bottom - p.b, left: r.left, width: r.width, height: p.b }, COLOR.padding)} />}
      {p.l > 0 && <div style={band({ top: r.top, left: r.left, width: p.l, height: r.height }, COLOR.padding)} />}
      {p.r > 0 && <div style={band({ top: r.top, left: r.right - p.r, width: p.r, height: r.height }, COLOR.padding)} />}
      {m.t > 0 && <Chip x={r.left + r.width / 2 - 10} y={r.top - m.t / 2 - 6} text={`${Math.round(m.t)}`} bg="#fb923c" />}
      {m.b > 0 && <Chip x={r.left + r.width / 2 - 10} y={r.bottom + m.b / 2 - 6} text={`${Math.round(m.b)}`} bg="#fb923c" />}
    </>
  );
}

/** a measured distance: the line, its end caps and the number */
function SpanLine({ s }: { s: Span }) {
  const vertical = Math.abs(s.x2 - s.x1) < Math.abs(s.y2 - s.y1);
  return (
    <>
      <div
        style={{
          ...base,
          top: Math.min(s.y1, s.y2),
          left: Math.min(s.x1, s.x2),
          width: vertical ? 1 : Math.abs(s.x2 - s.x1),
          height: vertical ? Math.abs(s.y2 - s.y1) : 1,
          background: COLOR.measure,
        }}
      />
      <Chip
        x={vertical ? s.x1 + 5 : (s.x1 + s.x2) / 2 - 8}
        y={vertical ? (s.y1 + s.y2) / 2 - 7 : s.y1 - 16}
        text={s.label}
        bg={COLOR.measure}
      />
    </>
  );
}

export function Overlay({
  hover,
  selection,
  marquee,
  guides,
  spans,
  sectionsMode,
  showSpacing,
  showGrid,
  showCentring,
  note,
  pins,
}: {
  hover: HTMLElement | null;
  selection: HTMLElement[];
  marquee: Box | null;
  guides: Guide[];
  spans: Span[];
  sectionsMode: boolean;
  showSpacing: boolean;
  showGrid: boolean;
  showCentring: boolean;
  note: string | null;
  /** numbered design notes pinned to elements, violet, exported in the report */
  pins: Array<{ el: HTMLElement; text: string; n: number }>;
}) {
  const primary = selection[0] ?? null;
  const c = showCentring && primary ? centring(primary) : null;

  return (
    <div data-editmode-ui="">
      {/* an 8px baseline grid, the scale the spacing is supposed to sit on */}
      {showGrid && (
        <div
          style={{
            ...base,
            inset: 0,
            backgroundImage:
              "repeating-linear-gradient(to bottom, rgba(255,255,255,0.09) 0 1px, transparent 1px 8px)",
          }}
        />
      )}

      {showSpacing && selection.map((el, i) => <SpacingBands key={i} el={el} />)}

      {/* hover */}
      {hover && !selection.includes(hover) && (
        <>
          <div
            style={{
              ...base,
              top: hover.getBoundingClientRect().top,
              left: hover.getBoundingClientRect().left,
              width: hover.getBoundingClientRect().width,
              height: hover.getBoundingClientRect().height,
              outline: `1.5px solid ${sectionsMode ? COLOR.section : COLOR.hover}`,
              background: sectionsMode ? "rgba(167,139,250,0.07)" : "rgba(74,222,128,0.05)",
            }}
          />
          <Chip
            x={hover.getBoundingClientRect().left}
            y={hover.getBoundingClientRect().top - 15}
            text={shortLabel(hover)}
            bg={sectionsMode ? COLOR.section : COLOR.hover}
          />
        </>
      )}

      {/* selection: every member outlined, the primary one labelled */}
      {selection.map((el, i) => {
        const r = el.getBoundingClientRect();
        return (
          <div
            key={i}
            style={{
              ...base,
              top: r.top,
              left: r.left,
              width: r.width,
              height: r.height,
              outline: `1.5px solid ${COLOR.select}`,
              background: "rgba(59,130,246,0.06)",
              boxShadow: i === 0 ? `0 0 0 1px rgba(59,130,246,0.35)` : undefined,
            }}
          />
        );
      })}
      {primary && (
        <Chip
          x={primary.getBoundingClientRect().left}
          y={primary.getBoundingClientRect().top - 15}
          text={
            selection.length > 1
              ? `${selection.length} selected`
              : `${shortLabel(primary)}  ${Math.round(primary.getBoundingClientRect().width)}x${Math.round(
                  primary.getBoundingClientRect().height,
                )}`
          }
          bg={COLOR.select}
        />
      )}

      {/* centring: the parent's centre line, plus the two side gaps that prove it */}
      {c && primary && (
        <>
          <div
            style={{
              ...base,
              top: c.inner.top,
              left: (c.inner.left + c.inner.right) / 2,
              width: 1,
              height: c.inner.bottom - c.inner.top,
              background: c.centeredX ? COLOR.measure : "rgba(244,114,182,0.35)",
            }}
          />
          <Chip
            x={(c.inner.left + c.inner.right) / 2 + 5}
            y={primary.getBoundingClientRect().top - 15}
            text={
              c.centeredX
                ? `centred  ${c.leftGap} | ${c.rightGap}`
                : `off centre by ${c.offsetX > 0 ? "+" : ""}${c.offsetX}  (${c.leftGap} | ${c.rightGap})`
            }
            bg={c.centeredX ? COLOR.measure : COLOR.warn}
          />
        </>
      )}

      {guides.map((g, i) => (
        <div
          key={i}
          style={{
            ...base,
            top: Math.min(g.y1, g.y2),
            left: Math.min(g.x1, g.x2),
            width: Math.max(1, Math.abs(g.x2 - g.x1)),
            height: Math.max(1, Math.abs(g.y2 - g.y1)),
            background: COLOR.guide,
          }}
        />
      ))}

      {spans.map((s, i) => (
        <SpanLine key={i} s={s} />
      ))}

      {pins.map((p) => {
        const r = p.el.getBoundingClientRect();
        return (
          <div key={p.n} style={{ ...base, top: r.top - 8, left: r.right - 8, display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                width: 16,
                height: 16,
                display: "grid",
                placeItems: "center",
                background: "#8b5cf6",
                color: "#0b0b0e",
                fontWeight: 700,
              }}
            >
              {p.n}
            </span>
            <span style={{ padding: "1px 5px", background: "rgba(139,92,246,0.9)", color: "#0b0b0e", whiteSpace: "nowrap", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
              {p.text}
            </span>
          </div>
        );
      })}

      {marquee && (
        <div
          style={{
            ...base,
            top: marquee.top,
            left: marquee.left,
            width: marquee.right - marquee.left,
            height: marquee.bottom - marquee.top,
            border: `1px solid ${COLOR.select}`,
            background: "rgba(59,130,246,0.12)",
          }}
        />
      )}

      {note && primary && (
        <Chip
          x={primary.getBoundingClientRect().left}
          y={primary.getBoundingClientRect().bottom + 4}
          text={note}
          bg="#e8e8e8"
        />
      )}
    </div>
  );
}
