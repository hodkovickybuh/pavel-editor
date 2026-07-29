/**
 * The editor's design language, in one place. Everything is inline styles (the
 * panel lives inside the page it edits, so it must not add stylesheets or
 * classes to the very DOM it inspects), and these are the only values the
 * controls are allowed to use.
 *
 * The look: a dark instrument, not a form. Panel base near-black, 1px hairlines
 * everywhere and never 2, radius 0 on everything (the site's own sharp-edge
 * rule), all-mono type, and exactly two accents with fixed jobs: MINT for
 * active state, changed values and focus; VIOLET only for selection chrome and
 * the marquee. A control never wears both.
 */

export const UI = {
  bg: "#0b0b0e",
  inset: "#08080a",
  raised: "#141419",
  border: "#232329",
  text: "#e8e8ec",
  dim: "#8a8a94",
  faint: "#4a4a52",
  mint: "#34d399",
  mintFill: "rgba(52,211,153,0.10)",
  violet: "#8b5cf6",
  danger: "#f0616d",
  warn: "#f59e0b",
  mono: {
    fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 11,
    lineHeight: 1.45,
  } as React.CSSProperties,
} as const;

/** a toolbar/inline button: transparent, hairline, hover raises, active goes mint */
export const toolBtn = (active?: boolean): React.CSSProperties => ({
  height: 24,
  padding: "0 8px",
  cursor: "pointer",
  background: "transparent",
  border: `1px solid ${active ? UI.mint : UI.border}`,
  color: active ? UI.mint : UI.dim,
  fontWeight: 600,
  ...UI.mono,
  fontSize: 10,
  letterSpacing: "0.04em",
});

/** an input well: inset, hairline, focus border handled by the caller */
export const inputStyle: React.CSSProperties = {
  height: 24,
  background: UI.inset,
  border: `1px solid ${UI.border}`,
  color: UI.text,
  padding: "0 6px",
  ...UI.mono,
};

/** a section header row: 10px uppercase tracked label over a full-bleed hairline */
export const sectionHeader: React.CSSProperties = {
  ...UI.mono,
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: UI.dim,
};
