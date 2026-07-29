/**
 * The editor's real stylesheet, injected once into the host page, every rule
 * scoped under [data-editmode-ui] so nothing can leak into the site being
 * edited. This exists because inline styles cannot express :hover, :focus,
 * transitions or scrollbars, and without those any panel reads as a cheap form
 * no matter how good its layout is. The polish lives here.
 */

export const ACCENT = "#3ae6a4";
export const VIOLET = "#a78bfa";

export const EDITOR_CSS = `
[data-editmode-ui], [data-editmode-ui] * { box-sizing: border-box; }

[data-editmode-ui] {
  --pe-bg: rgba(10,10,13,0.97);
  --pe-inset: #060608;
  --pe-raised: #16161c;
  --pe-hover: #101016;
  --pe-border: #24242c;
  --pe-border-lit: #34343e;
  --pe-text: #ededf2;
  --pe-dim: #8b8b96;
  --pe-faint: #55555f;
  --pe-mint: ${ACCENT};
  --pe-mint-dim: rgba(58,230,164,0.12);
  --pe-violet: ${VIOLET};
  --pe-violet-dim: rgba(167,139,250,0.14);
  --pe-warn: #f5b04e;
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
}

/* ---------------------------------------------------------------- panel */

.pe-panel {
  position: fixed;
  width: 288px;
  max-height: 94vh;
  display: flex;
  flex-direction: column;
  z-index: 2147483000;
  color: var(--pe-text);
  background: var(--pe-bg);
  border: 1px solid var(--pe-border);
  border-top: 2px solid var(--pe-mint);
  box-shadow: 0 24px 80px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}
.pe-scroll { overflow-y: auto; flex: 1; overscroll-behavior: contain; }
.pe-scroll::-webkit-scrollbar { width: 8px; }
.pe-scroll::-webkit-scrollbar-thumb { background: var(--pe-border); border: 2px solid transparent; background-clip: content-box; }
.pe-scroll::-webkit-scrollbar-thumb:hover { background: var(--pe-border-lit); background-clip: content-box; }

.pe-head {
  display: flex; align-items: center; gap: 8px;
  height: 40px; padding: 0 10px 0 14px; flex: none;
  border-bottom: 1px solid var(--pe-border);
  cursor: grab; user-select: none;
}
.pe-head:active { cursor: grabbing; }
.pe-title { font-weight: 700; font-size: 11px; letter-spacing: 0.14em; }
.pe-title b { color: var(--pe-mint); font-weight: 700; }
.pe-chip {
  font-size: 9px; letter-spacing: 0.08em; color: var(--pe-dim);
  border: 1px solid var(--pe-border); padding: 2px 6px;
}

/* --------------------------------------------------------------- controls */

.pe-btn {
  height: 26px; padding: 0 10px; cursor: pointer;
  background: transparent; border: 1px solid var(--pe-border);
  color: var(--pe-dim); font: inherit; font-size: 10px; font-weight: 600;
  letter-spacing: 0.05em;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.pe-btn:hover { background: var(--pe-hover); color: var(--pe-text); border-color: var(--pe-border-lit); }
.pe-btn:disabled { opacity: 0.35; cursor: default; }
.pe-btn:disabled:hover { background: transparent; color: var(--pe-dim); border-color: var(--pe-border); }
.pe-btn.on { color: var(--pe-mint); border-color: var(--pe-mint); background: var(--pe-mint-dim); }
.pe-btn.sm { height: 22px; padding: 0 7px; }

.pe-seg { display: inline-flex; background: var(--pe-inset); border: 1px solid var(--pe-border); }
.pe-seg button {
  height: 24px; padding: 0 10px; cursor: pointer; border: none; background: transparent;
  color: var(--pe-faint); font: inherit; font-size: 10px; font-weight: 600; letter-spacing: 0.05em;
  transition: background 120ms ease, color 120ms ease;
}
.pe-seg button:hover { color: var(--pe-dim); }
.pe-seg button.on { background: var(--pe-raised); color: var(--pe-mint); }

.pe-input, .pe-select {
  height: 24px; background: var(--pe-inset); border: 1px solid var(--pe-border);
  color: var(--pe-text); padding: 0 7px; font: inherit; font-size: 11px;
  transition: border-color 120ms ease;
}
.pe-input:hover, .pe-select:hover { border-color: var(--pe-border-lit); }
.pe-input:focus, .pe-select:focus { outline: none; border-color: var(--pe-mint); }
.pe-input::placeholder { color: var(--pe-faint); }

.pe-tabs { display: flex; border-bottom: 1px solid var(--pe-border); flex: none; }
.pe-tab {
  flex: 1; height: 30px; cursor: pointer; border: none; background: transparent;
  color: var(--pe-faint); font: inherit; font-size: 9px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.12em; position: relative;
  transition: color 120ms ease;
}
.pe-tab:hover { color: var(--pe-dim); }
.pe-tab.on { color: var(--pe-text); }
.pe-tab.on::after {
  content: ""; position: absolute; left: 25%; right: 25%; bottom: -1px; height: 2px;
  background: var(--pe-mint);
}
.pe-tab .n { color: var(--pe-mint); margin-left: 4px; }

/* ------------------------------------------------------------------ rows */

.pe-group-head {
  display: flex; align-items: center; gap: 7px; width: 100%; height: 30px;
  padding: 0 14px; cursor: pointer; background: transparent; border: none;
  border-bottom: 1px solid var(--pe-border); text-align: left;
  color: var(--pe-dim); font: inherit; font-size: 9.5px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.12em;
  transition: color 120ms ease, background 120ms ease;
}
.pe-group-head:hover { color: var(--pe-text); background: var(--pe-hover); }
.pe-group-head .tw { color: var(--pe-faint); font-size: 8px; width: 8px; transition: transform 120ms ease; }
.pe-group-head .dot { margin-left: auto; width: 5px; height: 5px; background: var(--pe-mint); }

.pe-row {
  display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 14px;
  position: relative; transition: background 100ms ease;
}
.pe-row:hover { background: var(--pe-hover); }
.pe-row .lbl {
  width: 116px; flex: none; color: var(--pe-dim); font-size: 10px; letter-spacing: 0.04em;
  user-select: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pe-row .lbl.scrub { cursor: ew-resize; }
.pe-row .lbl.scrub:hover { color: var(--pe-mint); }
.pe-row .val { margin-left: auto; width: 66px; text-align: right; }
.pe-row .val.changed { color: var(--pe-mint); }
.pe-tick {
  position: absolute; left: 0; top: 5px; bottom: 5px; width: 3px; padding: 0;
  border: none; cursor: pointer; background: var(--pe-mint);
  transition: width 100ms ease;
}
.pe-tick:hover { width: 6px; }

.pe-swatch {
  width: 18px; height: 18px; padding: 0; cursor: pointer;
  border: 1px solid var(--pe-border-lit);
  transition: transform 100ms ease, border-color 100ms ease;
}
.pe-swatch:hover { transform: scale(1.15); border-color: var(--pe-text); }

.pe-crumb { border: none; background: transparent; padding: 0; cursor: pointer; font: inherit; font-size: 9.5px; color: var(--pe-dim); text-decoration: underline; text-underline-offset: 2px; transition: color 100ms ease; }
.pe-crumb:hover { color: var(--pe-text); }
.pe-crumb.on { color: var(--pe-violet); text-decoration: none; }

.pe-key {
  display: inline-block; min-width: 16px; padding: 1px 5px; text-align: center;
  border: 1px solid var(--pe-border); border-bottom-width: 2px;
  color: var(--pe-text); font-size: 9.5px; background: var(--pe-raised);
}

.pe-cta {
  flex: 1; height: 32px; cursor: pointer; border: none;
  background: var(--pe-mint); color: #07120d;
  font: inherit; font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em;
  transition: filter 120ms ease, background 160ms ease;
}
.pe-cta:hover { filter: brightness(1.1); }
.pe-cta.done { background: var(--pe-text); }

.pe-layer {
  display: flex; align-items: center; gap: 4px; height: 24px; cursor: pointer;
  color: var(--pe-text); font-size: 10px; transition: background 100ms ease;
}
.pe-layer:hover { background: var(--pe-hover); }
.pe-layer.sel { color: var(--pe-violet); background: var(--pe-violet-dim); }

.pe-change {
  display: flex; gap: 8px; padding: 6px 10px 6px 14px; margin-bottom: 2px;
  border-left: 3px solid var(--pe-mint); transition: background 100ms ease;
}
.pe-change:hover { background: var(--pe-hover); }
.pe-change.note { border-left-color: var(--pe-violet); }

/* fade-in for the panel and the note bar */
@keyframes pe-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.pe-panel, .pe-float { animation: pe-in 160ms ease; }
.pe-float {
  position: fixed; z-index: 2147483000; display: flex; gap: 8px; align-items: center;
  padding: 10px; background: var(--pe-bg); border: 1px solid var(--pe-border);
  box-shadow: 0 16px 60px rgba(0,0,0,0.6);
}
`;
