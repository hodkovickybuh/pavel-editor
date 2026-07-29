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

/** the canvas chrome, in the same quiet family as the panel: candy blue for
    selection, turquoise for hover, soft rose for measurements */
export const COLOR = {
  hover: "#99e1d9",
  select: "#b2d5e5",
  section: "#b7a6e8",
  measure: "#e8a6c0",
  guide: "#e8a6c0",
  margin: "rgba(232,192,122,0.26)",
  padding: "rgba(153,225,217,0.22)",
  warn: "#e8c07a",
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
  liveStroke,
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
  pins: Array<{ el: HTMLElement; text: string; n: number; mark?: string }>;
  /** the freehand circling stroke currently being drawn, SVG points */
  liveStroke: string | null;
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

      {/* selection: every member outlined; the primary gets Figma-style corner
          handles and a dimensions chip. Handles are visual affordances only,
          the resize hit zones live on the element's actual edges. */}
      {selection.map((el, i) => {
        const r = el.getBoundingClientRect();
        const primary = i === 0;
        const handle = (x: number, y: number, k: string) => (
          <div
            key={k}
            style={{
              ...base,
              top: y - 3.5,
              left: x - 3.5,
              width: 7,
              height: 7,
              background: "#fff",
              border: `1.5px solid ${COLOR.select}`,
            }}
          />
        );
        return (
          <div key={i} style={{ ...base, top: 0, left: 0, width: 0, height: 0 }}>
            <div
              style={{
                ...base,
                top: r.top,
                left: r.left,
                width: r.width,
                height: r.height,
                outline: `1.5px solid ${COLOR.select}`,
                background: primary ? "transparent" : "rgba(59,130,246,0.05)",
              }}
            />
            {primary && [
              handle(r.left, r.top, "nw"),
              handle(r.right, r.top, "ne"),
              handle(r.left, r.bottom, "sw"),
              handle(r.right, r.bottom, "se"),
            ]}
            {primary && (
              <div
                style={{
                  ...base,
                  top: r.bottom + 6,
                  left: r.left + r.width / 2,
                  transform: "translateX(-50%)",
                  padding: "2px 7px",
                  background: COLOR.select,
                  color: "#16241f",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                {Math.round(r.width)} × {Math.round(r.height)}
              </div>
            )}
          </div>
        );
      })}
      {primary && (
        <Chip
          x={primary.getBoundingClientRect().left}
          y={primary.getBoundingClientRect().top - 15}
          text={selection.length > 1 ? `${selection.length} selected` : shortLabel(primary)}
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

      {/* freehand circling marks: the drawn stroke stays with its note */}
      {(liveStroke || pins.some((p) => p.mark)) && (
        <svg style={{ ...base, inset: 0, width: "100vw", height: "100vh" }}>
          {pins.filter((p) => p.mark).map((p) => (
            <polyline key={p.n} points={p.mark} fill="none" stroke={COLOR.section} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
          ))}
          {liveStroke && <polyline points={liveStroke} fill="none" stroke={COLOR.section} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
      )}

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
