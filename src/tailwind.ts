/**
 * TAILWIND MODE.
 *
 * On a Tailwind site the report's advice ("write this rule in that file") has
 * nowhere to land: there is no stylesheet to edit, the values live in class
 * attributes on the markup. So when the page looks like Tailwind, every style
 * change also reports the class that expresses it.
 *
 * The scale is Tailwind's default (spacing = n × 4px, radius and type on named
 * steps). A value off the scale reports the arbitrary-value form, `mt-[37px]`,
 * which is what a person would write by hand anyway. Breakpoint prefixes are a
 * best guess from the band's own edges against Tailwind's default screens; the
 * report says to check them against the project's config, because a customised
 * `screens` block is common and this cannot read it.
 */

import { edDoc } from "./context";

/** does this page look like Tailwind? */
export function looksTailwind(): boolean {
  const doc = edDoc();
  // the v3+ runtime leaves --tw-* custom properties on the root
  const rootStyle = doc.documentElement.getAttribute("style") ?? "";
  if (rootStyle.includes("--tw-")) return true;
  for (const sheet of Array.from(doc.styleSheets).slice(0, 8)) {
    try {
      for (const r of Array.from(sheet.cssRules).slice(0, 60)) {
        if ((r as CSSStyleRule).cssText?.includes("--tw-")) return true;
      }
    } catch {
      /* cross-origin */
    }
  }
  // or the markup itself carries the grammar
  const cls = /(^|\s)(?:(?:sm|md|lg|xl|2xl|hover|focus|dark)[:])*(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|text|rounded|w|h|flex|grid|items|justify)-/;
  let seen = 0;
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>("body *")).slice(0, 400)) {
    const c = el.getAttribute("class");
    if (c && cls.test(c)) seen += 1;
    if (seen >= 6) return true;
  }
  return false;
}

const PREFIX: Record<string, string> = {
  "margin-top": "mt", "margin-bottom": "mb", "margin-left": "ml", "margin-right": "mr",
  "padding-top": "pt", "padding-bottom": "pb", "padding-left": "pl", "padding-right": "pr",
  gap: "gap", "row-gap": "gap-y", "column-gap": "gap-x",
  width: "w", height: "h", "max-width": "max-w",
  "font-size": "text", "line-height": "leading", "letter-spacing": "tracking",
  "border-radius": "rounded", opacity: "opacity",
  color: "text", "background-color": "bg", "border-color": "border",
  "text-align": "text", "font-weight": "font", "text-transform": "", display: "",
  "flex-direction": "flex", "justify-content": "justify", "align-items": "items",
};

const RADIUS: Array<[number, string]> = [
  [0, "rounded-none"], [2, "rounded-sm"], [4, "rounded"], [6, "rounded-md"],
  [8, "rounded-lg"], [12, "rounded-xl"], [16, "rounded-2xl"], [24, "rounded-3xl"],
];
const TEXT: Array<[number, string]> = [
  [12, "text-xs"], [14, "text-sm"], [16, "text-base"], [18, "text-lg"], [20, "text-xl"],
  [24, "text-2xl"], [30, "text-3xl"], [36, "text-4xl"], [48, "text-5xl"], [60, "text-6xl"],
  [72, "text-7xl"], [96, "text-8xl"], [128, "text-9xl"],
];
const WEIGHT: Record<string, string> = {
  "300": "font-light", "400": "font-normal", "500": "font-medium", "600": "font-semibold",
  "700": "font-bold", "800": "font-extrabold", "900": "font-black",
};
const ENUMS: Record<string, Record<string, string>> = {
  "text-align": { left: "text-left", center: "text-center", right: "text-right", justify: "text-justify" },
  "text-transform": { uppercase: "uppercase", lowercase: "lowercase", capitalize: "capitalize", none: "normal-case" },
  display: { block: "block", flex: "flex", "inline-flex": "inline-flex", grid: "grid", "inline-block": "inline-block", none: "hidden" },
  "flex-direction": { row: "flex-row", column: "flex-col", "row-reverse": "flex-row-reverse", "column-reverse": "flex-col-reverse" },
  "justify-content": { "flex-start": "justify-start", center: "justify-center", "flex-end": "justify-end", "space-between": "justify-between", "space-around": "justify-around", "space-evenly": "justify-evenly" },
  "align-items": { stretch: "items-stretch", "flex-start": "items-start", center: "items-center", "flex-end": "items-end", baseline: "items-baseline" },
  "flex-wrap": { nowrap: "flex-nowrap", wrap: "flex-wrap" },
  position: { static: "static", relative: "relative", absolute: "absolute", fixed: "fixed", sticky: "sticky" },
};

/** Tailwind's default screens, as the band edges this tool works in */
const SCREENS: Array<[number, string]> = [
  [640, "sm"], [768, "md"], [1024, "lg"], [1280, "xl"], [1536, "2xl"],
];

/**
 * The variant prefix for a band. Tailwind is mobile-first, so a band with a
 * lower bound is `md:`-style, and a band that only goes DOWN needs `max-md:`;
 * a band with both bounds needs both, which is exactly as fiddly as it sounds
 * and why the report tells the applier to sanity-check it.
 */
function variantFor(bucket: string): string {
  if (bucket === "d") return "md:";
  if (bucket === "m") return "max-md:";
  const [loRaw, hiRaw] = bucket.split("-");
  const lo = Number(loRaw);
  const parts: string[] = [];
  if (lo > 0) {
    const screen = SCREENS.find(([px]) => px >= lo) ?? SCREENS[SCREENS.length - 1];
    parts.push(`${screen[1]}:`);
  }
  if (hiRaw) {
    const hi = Number(hiRaw);
    const screen = SCREENS.find(([px]) => px > hi);
    if (screen) parts.push(`max-${screen[1]}:`);
  }
  return parts.join("");
}

const spacing = (px: number): string | null => {
  const n = px / 4;
  if (n < 0) return null;
  if (Number.isInteger(n) && n <= 96) return String(n);
  if ([0.5, 1.5, 2.5, 3.5].includes(n)) return String(n);
  return null;
};

const nearest = (table: Array<[number, string]>, px: number) =>
  table.find(([v]) => Math.abs(v - px) < 0.51)?.[1] ?? null;

/**
 * The class for one change, prefixed for its band and state. Returns null only
 * when the property has no class expression at all (a shadow string, a filter),
 * in which case the CSS line in the report is the honest answer.
 */
export function tailwindFor(prop: string, value: string, bucket?: string, state?: string): string | null {
  const variant = (bucket ? variantFor(bucket) : "") + (state ? `${state === "focus-visible" ? "focus-visible" : state}:` : "");
  const enums = ENUMS[prop];
  if (enums) {
    const hit = enums[value];
    return hit ? variant + hit : null;
  }
  if (prop === "font-weight") {
    const hit = WEIGHT[value.trim()];
    return hit ? variant + hit : null;
  }
  const pxMatch = /^(-?\d*\.?\d+)px$/.exec(value.trim());
  const prefix = PREFIX[prop];
  if (!prefix) return null;

  if (prop === "color" || prop === "background-color" || prop === "border-color") {
    // colours are project tokens, never guessable as a Tailwind palette name
    return `${variant}${prefix}-[${value.replace(/\s+/g, "")}]`;
  }
  if (!pxMatch) {
    if (prop === "opacity") {
      const n = Math.round(parseFloat(value) * 100);
      return Number.isFinite(n) ? `${variant}opacity-${n}` : null;
    }
    // a raw unit the designer typed: 10vw, 50%, 3rem
    return `${variant}${prefix}-[${value.replace(/\s+/g, "")}]`;
  }
  const px = parseFloat(pxMatch[1]);
  if (prop === "border-radius") return variant + (nearest(RADIUS, px) ?? `rounded-[${px}px]`);
  if (prop === "font-size") return variant + (nearest(TEXT, px) ?? `text-[${px}px]`);
  if (prop === "line-height" || prop === "letter-spacing") return `${variant}${prefix}-[${px}px]`;
  const neg = px < 0 ? "-" : "";
  const step = spacing(Math.abs(px));
  if (step && (prop.startsWith("margin") || prop.startsWith("padding") || prop.includes("gap")))
    return `${variant}${neg}${prefix}-${step}`;
  return `${variant}${prefix}-[${px}px]`;
}
