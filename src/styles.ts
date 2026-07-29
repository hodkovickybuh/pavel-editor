/**
 * The editor's stylesheet, injected once, every rule scoped under
 * [data-editmode-ui] so nothing leaks into the site being edited.
 *
 * Design language v2, after real feedback ("looks like a virus"): the v1 panel
 * set EVERYTHING in mono caps inside 1px boxes, which reads as a debugger, not
 * a design tool. The rules that fix that are simple and they are law here:
 *
 *   - UI text is a normal UI face; MONO IS FOR NUMBERS ONLY.
 *   - Sentence case. No tracking-spaced caps anywhere but the wordmark.
 *   - Buttons are ghosts (fill on hover), not bordered rectangles.
 *   - One interactive accent (Figma-familiar blue). Mint is reserved for the
 *     wordmark and the one primary action. Violet marks selection and notes.
 *   - Soft radii and layered shadow: a tool floating OVER the page, not a
 *     terminal grafted onto it.
 */

export const ACCENT = "#4c9df2";
export const VIOLET = "#a78bfa";

export const EDITOR_CSS = `
[data-editmode-ui], [data-editmode-ui] * { box-sizing: border-box; }

[data-editmode-ui] {
  --pe-bg: rgba(24,24,28,0.98);
  --pe-well: rgba(255,255,255,0.045);
  --pe-well-hi: rgba(255,255,255,0.09);
  --pe-border: rgba(255,255,255,0.08);
  --pe-border-hi: rgba(255,255,255,0.16);
  --pe-text: #f2f2f5;
  --pe-dim: #a3a3ad;
  --pe-faint: #62626c;
  --pe-blue: ${ACCENT};
  --pe-blue-dim: rgba(76,157,242,0.16);
  --pe-mint: #35d69f;
  --pe-violet: ${VIOLET};
  --pe-violet-dim: rgba(167,139,250,0.16);
  --pe-warn: #f5b04e;
  --pe-mono: "SF Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  font-family: Inter, -apple-system, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
  font-size: 11.5px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* ---------------------------------------------------------------- panel */

.pe-panel {
  position: fixed;
  width: 280px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  z-index: 2147483000;
  color: var(--pe-text);
  background: var(--pe-bg);
  border: 1px solid var(--pe-border);
  border-radius: 13px;
  box-shadow: 0 0 0 0.5px rgba(0,0,0,0.5), 0 24px 70px rgba(0,0,0,0.55), 0 4px 14px rgba(0,0,0,0.35);
  backdrop-filter: blur(24px) saturate(1.1);
  -webkit-backdrop-filter: blur(24px) saturate(1.1);
  overflow: hidden;
}
.pe-scroll { overflow-y: auto; flex: 1; overscroll-behavior: contain; }
.pe-scroll::-webkit-scrollbar { width: 10px; }
.pe-scroll::-webkit-scrollbar-thumb { background: var(--pe-well-hi); border: 3px solid transparent; background-clip: content-box; border-radius: 5px; }

.pe-head {
  display: flex; align-items: center; gap: 8px;
  height: 42px; padding: 0 8px 0 14px; flex: none;
  border-bottom: 1px solid var(--pe-border);
  cursor: grab; user-select: none;
}
.pe-head:active { cursor: grabbing; }
.pe-title { font-weight: 650; font-size: 12px; letter-spacing: -0.01em; }
.pe-title b { color: var(--pe-mint); font-weight: 750; }
.pe-chip {
  font-size: 10px; color: var(--pe-dim); font-family: var(--pe-mono);
  background: var(--pe-well); padding: 2px 8px; border-radius: 99px;
}

/* --------------------------------------------------------------- controls */

.pe-btn {
  display: inline-flex; align-items: center; gap: 5px;
  height: 26px; padding: 0 10px; cursor: pointer;
  background: transparent; border: none; border-radius: 7px;
  color: var(--pe-dim); font: inherit; font-size: 11px; font-weight: 550;
  transition: background 120ms ease, color 120ms ease;
}
.pe-btn:hover { background: var(--pe-well-hi); color: var(--pe-text); }
.pe-btn:disabled { opacity: 0.35; cursor: default; }
.pe-btn:disabled:hover { background: transparent; color: var(--pe-dim); }
.pe-btn.on { color: var(--pe-blue); background: var(--pe-blue-dim); }
.pe-btn.sm { height: 24px; padding: 0 7px; border-radius: 6px; }

.pe-seg {
  display: inline-flex; gap: 2px; padding: 2px;
  background: var(--pe-well); border-radius: 8px;
}
.pe-seg button {
  height: 22px; padding: 0 10px; cursor: pointer; border: none; border-radius: 6px;
  background: transparent; color: var(--pe-dim);
  font: inherit; font-size: 11px; font-weight: 550;
  transition: background 120ms ease, color 120ms ease, box-shadow 120ms ease;
}
.pe-seg button:hover { color: var(--pe-text); }
.pe-seg button.on { background: rgba(255,255,255,0.12); color: var(--pe-text); box-shadow: 0 1px 3px rgba(0,0,0,0.3); }

.pe-input, .pe-select {
  height: 25px; background: var(--pe-well); border: 1px solid transparent; border-radius: 6px;
  color: var(--pe-text); padding: 0 7px; font: inherit; font-size: 11px;
  transition: background 120ms ease, border-color 120ms ease;
}
.pe-input:hover, .pe-select:hover { background: var(--pe-well-hi); }
.pe-input:focus, .pe-select:focus { outline: none; border-color: var(--pe-blue); background: var(--pe-well); }
.pe-input::placeholder { color: var(--pe-faint); }
.pe-input.val { font-family: var(--pe-mono); font-size: 10.5px; }
.pe-input.val.changed { color: var(--pe-blue); font-weight: 600; }

.pe-tabs { display: flex; gap: 2px; padding: 6px 10px; border-bottom: 1px solid var(--pe-border); flex: none; }
.pe-tab {
  flex: 1; height: 26px; cursor: pointer; border: none; border-radius: 7px;
  background: transparent; color: var(--pe-dim);
  font: inherit; font-size: 11px; font-weight: 550; text-transform: capitalize;
  transition: background 120ms ease, color 120ms ease;
}
.pe-tab:hover { background: var(--pe-well); color: var(--pe-text); }
.pe-tab.on { background: var(--pe-well-hi); color: var(--pe-text); }
.pe-tab .n { color: var(--pe-blue); margin-left: 5px; font-family: var(--pe-mono); font-size: 10px; }

/* ------------------------------------------------------------------ rows */

.pe-group-head {
  display: flex; align-items: center; gap: 8px; width: 100%; height: 32px;
  padding: 0 14px; cursor: pointer; background: transparent; border: none;
  text-align: left; color: var(--pe-text); font: inherit; font-size: 11.5px;
  font-weight: 600; text-transform: capitalize;
  transition: background 120ms ease;
}
.pe-group-head:hover { background: var(--pe-well); }
.pe-group-head .tw { color: var(--pe-faint); font-size: 8px; width: 9px; transition: transform 140ms ease; }
.pe-group-head .dot { margin-left: auto; width: 6px; height: 6px; border-radius: 99px; background: var(--pe-blue); }

.pe-row {
  display: flex; align-items: center; gap: 7px; height: 28px; padding: 0 14px 0 18px;
  position: relative; border-radius: 6px; transition: background 100ms ease;
}
.pe-row:hover { background: var(--pe-well); }
.pe-row .lbl {
  width: 108px; flex: none; color: var(--pe-dim); font-size: 11px;
  user-select: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pe-row .lbl.scrub { cursor: ew-resize; }
.pe-row .lbl.scrub:hover { color: var(--pe-blue); }
.pe-row .val { margin-left: auto; width: 64px; text-align: right; }
.pe-tick {
  position: absolute; left: 6px; top: 50%; margin-top: -3px; width: 6px; height: 6px;
  padding: 0; border: none; border-radius: 99px; cursor: pointer; background: var(--pe-blue);
  transition: transform 120ms ease;
}
.pe-tick:hover { transform: scale(1.5); }

.pe-swatch {
  width: 19px; height: 19px; padding: 0; cursor: pointer; border-radius: 5px;
  border: 1px solid var(--pe-border-hi);
  transition: transform 100ms ease;
}
.pe-swatch:hover { transform: scale(1.12); }

.pe-crumb { border: none; background: transparent; padding: 0; cursor: pointer; font: inherit; font-size: 10.5px; color: var(--pe-dim); transition: color 100ms ease; }
.pe-crumb:hover { color: var(--pe-text); }
.pe-crumb.on { color: var(--pe-violet); font-weight: 600; }

.pe-key {
  display: inline-block; min-width: 18px; padding: 1px 6px; text-align: center;
  border: 1px solid var(--pe-border-hi); border-bottom-width: 2px; border-radius: 5px;
  color: var(--pe-text); font-size: 10px; font-family: var(--pe-mono);
  background: var(--pe-well);
}

.pe-cta {
  flex: 1; height: 34px; cursor: pointer; border: none; border-radius: 9px;
  background: linear-gradient(180deg, #3fe3ab, #27c68c);
  color: #04120c; font: inherit; font-size: 12px; font-weight: 700;
  box-shadow: 0 2px 10px rgba(53,214,159,0.25), inset 0 1px 0 rgba(255,255,255,0.25);
  transition: filter 120ms ease, transform 80ms ease;
}
.pe-cta:hover { filter: brightness(1.06); }
.pe-cta:active { transform: scale(0.985); }
.pe-cta.done { background: var(--pe-text); box-shadow: none; }

.pe-layer {
  display: flex; align-items: center; gap: 4px; height: 24px; cursor: pointer;
  color: var(--pe-text); font-size: 11px; border-radius: 5px;
  transition: background 100ms ease;
}
.pe-layer:hover { background: var(--pe-well); }
.pe-layer.sel { color: var(--pe-violet); background: var(--pe-violet-dim); }

.pe-change {
  display: flex; gap: 8px; align-items: flex-start;
  margin: 0 10px 6px; padding: 7px 8px 7px 10px;
  background: var(--pe-well); border-radius: 8px;
  border-left: 3px solid var(--pe-blue);
  transition: background 100ms ease;
}
.pe-change:hover { background: var(--pe-well-hi); }
.pe-change.note { border-left-color: var(--pe-violet); }
.pe-change .mono { font-family: var(--pe-mono); font-size: 10px; }

@keyframes pe-in { from { opacity: 0; transform: translateY(5px) scale(0.99); } to { opacity: 1; transform: none; } }
.pe-panel, .pe-float { animation: pe-in 180ms cubic-bezier(0.2, 0.7, 0.3, 1); }
.pe-float {
  position: fixed; z-index: 2147483000; display: flex; gap: 8px; align-items: center;
  padding: 10px 12px; background: var(--pe-bg); border: 1px solid var(--pe-border);
  border-radius: 11px; box-shadow: 0 16px 60px rgba(0,0,0,0.55);
}
`;
