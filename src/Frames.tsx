"use client";

/**
 * THE VIEWPORT CANVAS: the page at several widths at once, all of them live.
 *
 * One frame is the old device emulator. Three frames is the thing that changes
 * how responsive work feels: you edit the phone and watch the tablet and the
 * desktop hold their own values, instead of flipping between sizes and trying to
 * remember what the other one looked like.
 *
 * Every frame is a real same-origin iframe, so every frame runs the page's real
 * media queries at its real width. Nothing here is a scaled screenshot. The
 * editor's brains stay in the parent: the panel, the store and one undo history
 * across all of them. The frame the pointer is in becomes the edit target (see
 * context.ts), which is what makes a change land in that frame's breakpoint band.
 *
 * Scaling is visual only. A frame is 390 CSS pixels wide to the page inside it
 * whatever the transform says, so a media query cannot be fooled by the zoom.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEVICES } from "./devices";
import { UI, toolBtn } from "./theme";

export type FrameSpec = { w: number; h: number; label: string; id: number };

let nextId = 1;
export const makeFrame = (w: number, h: number, label: string): FrameSpec => ({ w, h, label, id: nextId++ });

/** the default set: a phone, a tablet and a laptop, which is the argument */
export const DEFAULT_FRAMES = (): FrameSpec[] => [
  makeFrame(390, 844, "iPhone 14"),
  makeFrame(834, 1112, "iPad Pro 11"),
  makeFrame(1440, 900, "MacBook Air 15"),
];

const TOOLBAR = 46;
const LABEL = 30;
const GAP = 20;
const PAD = 24;

export function Frames({
  frames,
  setFrames,
  onRealm,
  onActive,
  onClose,
  activeId,
}: {
  frames: FrameSpec[];
  setFrames: (f: FrameSpec[]) => void;
  /** fires with each frame's realm once its document is interactive */
  onRealm: (id: number, win: Window | null, doc: Document | null) => void;
  onActive: (id: number) => void;
  onClose: () => void;
  activeId: number | null;
}) {
  const [syncScroll, setSyncScroll] = useState(true);
  const [tick, setTick] = useState(0);
  const syncing = useRef(false);

  // the page's own URL, minus anything that would boot a second editor inside
  const src = useMemo(() => {
    const u = new URL(window.location.href);
    u.searchParams.delete("edit");
    u.searchParams.set("pe-frame", "1");
    return u.pathname + u.search;
  }, []);

  // one shared scale, so the frames stay honestly proportional to each other
  const totalW = frames.reduce((a, f) => a + f.w, 0) + GAP * Math.max(0, frames.length - 1);
  const maxH = frames.reduce((a, f) => Math.max(a, f.h), 0);
  const availW = window.innerWidth - PAD * 2 - 300; // the panel sits on the right
  const availH = window.innerHeight - TOOLBAR - LABEL - PAD * 2;
  const scale = Math.max(0.2, Math.min(1, availW / totalW, availH / maxH));

  useEffect(() => {
    const onResize = () => setTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  void tick;

  /**
   * SYNCHRONISED SCROLLING, by proportion rather than by pixel: the phone's page
   * is far taller than the desktop's, so matching scrollTop would put the frames
   * on different sections. Matching the fraction scrolled keeps them on the same
   * part of the page, which is the point.
   */
  const bindScroll = useCallback(
    (id: number, win: Window) => {
      const onScroll = () => {
        if (!syncScroll || syncing.current) return;
        const doc = win.document.documentElement;
        const range = doc.scrollHeight - win.innerHeight;
        const frac = range > 0 ? win.scrollY / range : 0;
        syncing.current = true;
        for (const [otherId, other] of wins.current) {
          if (otherId === id) continue;
          try {
            const od = other.document.documentElement;
            const orange = od.scrollHeight - other.innerHeight;
            other.scrollTo({ top: Math.round(frac * Math.max(0, orange)) });
          } catch {
            /* that frame navigated away */
          }
        }
        // release on the next frame, after the programmatic scrolls have fired
        requestAnimationFrame(() => {
          syncing.current = false;
        });
      };
      win.addEventListener("scroll", onScroll, { passive: true });
      return () => win.removeEventListener("scroll", onScroll);
    },
    [syncScroll],
  );

  const wins = useRef(new Map<number, Window>());
  /** which document each frame has already been handed off for. React calls an
      inline ref callback on EVERY render, so without this the handoff triggers a
      state update, which re-renders, which hands off again: a render loop that
      locks the page solid. Hand off once per document, and again only when that
      frame actually navigates. */
  const handed = useRef(new Map<number, Document>());

  return (
    <div data-editmode-ui="">
      {/* backdrop: the host page is hidden behind the canvas */}
      <div style={{ position: "fixed", inset: 0, zIndex: 2147481000, background: "#0b0d12" }} />

      {/* toolbar */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: TOOLBAR,
          zIndex: 2147482500,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 14px",
          background: UI.bg,
          borderBottom: `1px solid ${UI.border}`,
          ...UI.mono,
        }}
      >
        <span style={{ color: UI.text, fontWeight: 700, letterSpacing: "0.06em", fontSize: 11 }}>VIEWPORTS</span>

        <select
          value=""
          onChange={(e) => {
            const d = DEVICES.find((x) => x.label === e.target.value);
            if (d) setFrames([...frames, makeFrame(d.w, d.h, d.label)]);
          }}
          style={{ background: UI.inset, border: `1px solid ${UI.border}`, color: UI.text, padding: "4px 6px", ...UI.mono }}
          title="add a viewport"
        >
          <option value="">+ add a size…</option>
          {(["phone", "tablet", "laptop"] as const).map((g) => (
            <optgroup key={g} label={g}>
              {DEVICES.filter((d) => d.group === g).map((d) => (
                <option key={d.label} value={d.label}>
                  {d.label} · {d.w}x{d.h}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <button
          style={toolBtn()}
          title="the three that matter: a phone, a tablet and a laptop"
          onClick={() => setFrames(DEFAULT_FRAMES())}
        >
          reset to 3
        </button>

        <button
          style={{ ...toolBtn(), color: syncScroll ? UI.mint : UI.dim, borderColor: syncScroll ? UI.mint : UI.border }}
          onClick={() => setSyncScroll((v) => !v)}
          title="scroll every viewport to the same part of the page"
        >
          {syncScroll ? "◉ scroll together" : "○ scroll apart"}
        </button>

        <span style={{ color: UI.dim, fontSize: 11 }}>{Math.round(scale * 100)}%</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: UI.dim, fontSize: 11 }}>the frame you point at is the one you edit</span>
        <button style={toolBtn()} onClick={onClose} title="back to the page itself">
          exit
        </button>
      </div>

      {/* the frames */}
      <div
        style={{
          position: "fixed",
          top: TOOLBAR,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 2147482000,
          overflowX: "auto",
          overflowY: "hidden",
          padding: `${PAD}px`,
        }}
      >
        <div style={{ display: "flex", gap: GAP * scale, alignItems: "flex-start", minWidth: "min-content" }}>
          {frames.map((f) => {
            const on = activeId === f.id;
            return (
              <div key={f.id} style={{ width: f.w * scale, flex: "none" }}>
                {/* label bar */}
                <div
                  style={{
                    height: LABEL,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: on ? UI.mint : UI.dim,
                    ...UI.mono,
                    fontSize: 11,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{f.label}</span>
                  <span style={{ color: UI.dim }}>{f.w}</span>
                  {on && <span style={{ color: UI.mint }}>· editing</span>}
                  <span style={{ flex: 1 }} />
                  <button
                    style={{ ...toolBtn(), padding: "0 6px", height: 20 }}
                    title="reload this viewport"
                    onClick={() => {
                      const w = wins.current.get(f.id);
                      try {
                        w?.location.reload();
                      } catch {
                        /* gone */
                      }
                    }}
                  >
                    ↻
                  </button>
                  {frames.length > 1 && (
                    <button
                      style={{ ...toolBtn(), padding: "0 6px", height: 20 }}
                      title="remove this viewport"
                      onClick={() => {
                        wins.current.delete(f.id);
                        handed.current.delete(f.id);
                        onRealm(f.id, null, null);
                        setFrames(frames.filter((x) => x.id !== f.id));
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* the device itself */}
                <div
                  style={{
                    width: f.w * scale,
                    height: f.h * scale,
                    outline: on ? `2px solid ${UI.mint}` : `1px solid ${UI.border}`,
                    boxShadow: on ? "0 20px 60px rgba(0,0,0,0.55)" : "0 10px 40px rgba(0,0,0,0.4)",
                    background: "#fff",
                    overflow: "hidden",
                  }}
                >
                  <iframe
                    name="pavel-editor-frame"
                    title={`${f.label} ${f.w}px`}
                    src={src}
                    style={{
                      width: f.w,
                      height: f.h,
                      border: "none",
                      display: "block",
                      transform: `scale(${scale})`,
                      transformOrigin: "top left",
                    }}
                    ref={(el) => {
                      if (!el) return;
                      const hand = () => {
                        try {
                          const w = el.contentWindow;
                          const d = el.contentDocument;
                          if (!w || !d || d.URL === "about:blank") return;
                          if (handed.current.get(f.id) === d) return;
                          handed.current.set(f.id, d);
                          wins.current.set(f.id, w);
                          bindScroll(f.id, w);
                          onRealm(f.id, w, d);
                        } catch {
                          // opaque origin (file://): the frame renders but cannot
                          // be edited. http(s) pages are unaffected.
                        }
                      };
                      el.onload = hand;
                      // a cached page can finish loading before this ref runs, so
                      // the load event is already gone: hand off what is there
                      const d = el.contentDocument;
                      if (d && d.readyState !== "loading" && d.body && d.URL !== "about:blank") hand();
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
