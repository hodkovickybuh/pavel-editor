"use client";

/**
 * The viewport emulator: the page at an exact WxH, Chrome-DevTools style.
 *
 * The only honest way to do this is an IFRAME. Media queries answer to the
 * viewport, so shrinking a wrapper div would show desktop CSS squeezed into a
 * phone shape, which is a lie. The iframe IS a 390px viewport, so the page in it
 * runs its real phone rules, and being same-origin the parent editor reaches
 * straight into its DOM: same panel, same undo history, no message protocol.
 *
 * The iframe URL strips ?edit so the page inside does not mount a second editor.
 * When the frame is taller than the window it is scaled down with a transform;
 * pointer coordinates inside the iframe are unaffected, because events there are
 * reported in the iframe's own coordinate space.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { DEVICES } from "./devices";
import { UI, toolBtn } from "./theme";

export type FrameSpec = { w: number; h: number; label: string };

export function Frame({
  spec,
  onChange,
  onReady,
  onClose,
}: {
  spec: FrameSpec;
  onChange: (spec: FrameSpec) => void;
  /** fires with the iframe's realm once its document is interactive */
  onReady: (win: Window, doc: Document) => void;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [wDraft, setWDraft] = useState<string | null>(null);
  const [hDraft, setHDraft] = useState<string | null>(null);

  // the page URL without the edit param, so the frame does not nest an editor
  const src = useMemo(() => {
    const u = new URL(window.location.href);
    u.searchParams.delete("edit");
    return u.pathname + u.search;
  }, []);

  // scale to fit under the toolbar; never upscale
  const TOOLBAR = 44;
  const scale = Math.min(
    1,
    (window.innerHeight - TOOLBAR - 24) / spec.h,
    (window.innerWidth - 24) / spec.w,
  );

  useEffect(() => {
    const el = iframeRef.current;
    if (!el) return;
    const handleLoad = () => {
      if (el.contentWindow && el.contentDocument) onReady(el.contentWindow, el.contentDocument);
    };
    el.addEventListener("load", handleLoad);
    return () => el.removeEventListener("load", handleLoad);
  }, [onReady]);

  const commit = (which: "w" | "h", raw: string) => {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 240 || n > 4000) return;
    onChange({ ...spec, [which]: n, label: "Responsive" });
  };

  const matched = DEVICES.find((d) => d.w === spec.w && d.h === spec.h);

  return (
    <div data-editmode-ui="">
      {/* backdrop: hides the desktop page behind and blocks its pointer events */}
      <div style={{ position: "fixed", inset: 0, zIndex: 2147481000, background: "#08080a" }} />

      {/* toolbar, Chrome-style top centre */}
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
          justifyContent: "center",
          gap: 8,
          background: UI.bg,
          borderBottom: `1px solid ${UI.border}`,
          ...UI.mono,
        }}
      >
        <select
          value={matched ? matched.label : "Responsive"}
          onChange={(e) => {
            const d = DEVICES.find((x) => x.label === e.target.value);
            if (d) onChange({ w: d.w, h: d.h, label: d.label });
          }}
          style={{
            background: UI.inset,
            border: `1px solid ${UI.border}`,
            color: UI.text,
            padding: "4px 6px",
            ...UI.mono,
          }}
        >
          <option>Responsive</option>
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

        <input
          value={wDraft ?? String(spec.w)}
          onChange={(e) => setWDraft(e.target.value)}
          onBlur={() => {
            if (wDraft !== null) commit("w", wDraft);
            setWDraft(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          style={{ width: 48, textAlign: "center", background: UI.inset, border: `1px solid ${UI.border}`, color: UI.text, padding: "4px 2px", ...UI.mono }}
        />
        <span style={{ color: UI.dim }}>x</span>
        <input
          value={hDraft ?? String(spec.h)}
          onChange={(e) => setHDraft(e.target.value)}
          onBlur={() => {
            if (hDraft !== null) commit("h", hDraft);
            setHDraft(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          style={{ width: 48, textAlign: "center", background: UI.inset, border: `1px solid ${UI.border}`, color: UI.text, padding: "4px 2px", ...UI.mono }}
        />

        <button style={toolBtn()} title="rotate" onClick={() => onChange({ w: spec.h, h: spec.w, label: spec.label })}>
          ⇄
        </button>
        <span style={{ color: UI.dim }}>{Math.round(scale * 100)}%</span>
        <button style={toolBtn()} onClick={onClose} title="back to the desktop page">
          exit device
        </button>
      </div>

      {/* the device itself */}
      <div
        style={{
          position: "fixed",
          top: TOOLBAR + 12,
          left: "50%",
          zIndex: 2147482000,
          transform: `translateX(-50%) scale(${scale})`,
          transformOrigin: "top center",
          width: spec.w,
          height: spec.h,
          outline: `1px solid ${UI.border}`,
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          background: "#000",
        }}
      >
        <iframe
          ref={iframeRef}
          src={src}
          style={{ width: spec.w, height: spec.h, border: "none", display: "block", background: "#000" }}
        />
      </div>
    </div>
  );
}
