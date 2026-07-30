/**
 * THE AUDIT.
 *
 * The checks a careful reviewer runs by hand, run against the live page instead:
 * real computed colours, real measured boxes, at the width the browser is
 * actually at. Every finding carries the element, so clicking it selects the
 * thing to fix, which is the whole point of auditing inside an editor rather
 * than in a report someone reads later.
 *
 * Sources for the thresholds: WCAG 2.1 AA (contrast 4.5:1 / 3:1 for large text,
 * 44px targets, reflow at 320px) and the house design rules (16px body on
 * phones, 65-75ch measure, values on the 4px scale).
 *
 * Deliberately cheap: one pass over a capped element list, computed styles read
 * once per element. It runs on demand, never on a timer, because a style read
 * over a few thousand nodes is a layout flush and this tool has to stay smooth
 * while dragging.
 */

import { csOf, edDoc, edWin } from "./context";
import { isEditable, shortLabel } from "./selectors";

export type Finding = {
  level: "fail" | "warn";
  rule: string;
  msg: string;
  el: HTMLElement | null;
};

const SCAN_CAP = 4000;

/* ------------------------------------------------------------------ colour */

type RGBA = [number, number, number, number];

function parseColor(v: string): RGBA | null {
  const m = /^rgba?\(([^)]+)\)/.exec(v);
  if (!m) return null;
  const parts = m[1].split(/[,/]/).map((s) => parseFloat(s));
  const [r, g, b] = parts;
  const a = parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1;
  return [r, g, b, a];
}

const over = (fg: RGBA, bg: RGBA): RGBA => [
  fg[0] * fg[3] + bg[0] * (1 - fg[3]),
  fg[1] * fg[3] + bg[1] * (1 - fg[3]),
  fg[2] * fg[3] + bg[2] * (1 - fg[3]),
  1,
];

const lum = ([r, g, b]: RGBA) => {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

export const contrastRatio = (a: RGBA, b: RGBA) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

/**
 * The colour actually painted behind an element: the first opaque ancestor.
 *
 * Returns null when something in the stack paints an IMAGE or a gradient. A
 * gradient's contrast varies across its own area and cannot be reduced to one
 * number by reading the CSSOM, so the honest answer is "not measurable here"
 * rather than a confident wrong ratio. Reporting 1.00:1 for white text on a navy
 * gradient, which this did, is worse than reporting nothing.
 */
function effectiveBg(el: HTMLElement): RGBA | null {
  let node: HTMLElement | null = el;
  let acc: RGBA | null = null;
  while (node) {
    const cs = csOf(node);
    if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
    const bg = parseColor(cs.backgroundColor);
    if (bg && bg[3] > 0) {
      acc = acc ? over(acc, bg) : bg;
      if (bg[3] >= 0.99) return acc;
    }
    node = node.parentElement;
  }
  // nothing opaque anywhere: the canvas is white in every browser default
  return acc ? over(acc, [255, 255, 255, 1]) : [255, 255, 255, 1];
}

/** does this element hold text of its own (not just its children's)? */
function ownText(el: HTMLElement): string {
  let out = "";
  for (const n of Array.from(el.childNodes)) if (n.nodeType === 3) out += n.textContent ?? "";
  return out.trim();
}

/* ------------------------------------------------------------------- audit */

export function runAudit(): Finding[] {
  const doc = edDoc();
  const win = edWin();
  const out: Finding[] = [];
  const narrow = win.innerWidth <= 640;
  const seenContrast = new Set<string>();

  // page-level: reflow. WCAG asks for no horizontal scroll at 320px, and a
  // horizontal scrollbar at ANY width is the single most reported layout bug
  const de = doc.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) {
    let worst: HTMLElement | null = null;
    let worstRight = de.clientWidth;
    for (const el of Array.from(doc.querySelectorAll<HTMLElement>("body *")).slice(0, SCAN_CAP)) {
      if (!isEditable(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > worstRight + 1 && csOf(el).position !== "fixed") {
        worst = el;
        worstRight = r.right;
      }
    }
    out.push({
      level: "fail",
      rule: "overflow",
      msg: `the page scrolls sideways at ${win.innerWidth}px (content reaches ${Math.round(de.scrollWidth)}px)${worst ? `, widest offender: ${shortLabel(worst)}` : ""}`,
      el: worst,
    });
  }

  // page-level: a viewport meta is what makes any of the phone work real
  if (!doc.querySelector('meta[name="viewport"]')) {
    out.push({ level: "fail", rule: "viewport", msg: "no <meta name=\"viewport\">: phones will render this at desktop width and scale it down", el: null });
  }

  // page-level: focus removed without a replacement. Keyboard users lose the
  // page entirely, and it is invisible to anyone testing with a mouse.
  let killsOutline = 0;
  let hasFocusVisible = false;
  for (const sheet of Array.from(doc.styleSheets)) {
    // never audit the editor's own stylesheet: its focus rules are the panel's,
    // not the page's, and reporting them made the tool fail itself
    if ((sheet.ownerNode as HTMLElement | null)?.id?.startsWith("pavel-editor")) continue;
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const r of Array.from(rules)) {
      const text = (r as CSSStyleRule).cssText;
      if (typeof text !== "string") continue;
      if (/:focus-visible/.test(text) && /outline|box-shadow|border/.test(text)) hasFocusVisible = true;
      if (/outline:\s*(none|0)/.test(text) && /:focus(?!-visible)/.test(text)) killsOutline += 1;
    }
  }
  if (killsOutline && !hasFocusVisible) {
    out.push({ level: "fail", rule: "focus", msg: `${killsOutline} rule(s) remove the focus outline and nothing defines a :focus-visible replacement`, el: null });
  }

  const els = Array.from(doc.querySelectorAll<HTMLElement>("body *")).slice(0, SCAN_CAP);
  for (const el of els) {
    if (!isEditable(el)) continue;
    const cs = csOf(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    const tag = el.tagName;

    // images: alt text, and the intrinsic size that stops the page jumping
    if (tag === "IMG") {
      const img = el as HTMLImageElement;
      if (!img.hasAttribute("alt")) out.push({ level: "fail", rule: "alt", msg: `image has no alt attribute (use alt="" if it is decorative): ${(img.currentSrc || img.src).split("/").pop()}`, el });
      if (!img.getAttribute("width") && !img.getAttribute("height") && cs.aspectRatio === "auto")
        out.push({ level: "warn", rule: "cls", msg: "image has no width/height or aspect-ratio: it will shift the layout as it loads", el });
    }

    // touch targets. 24x24 is the AA floor (WCAG 2.5.8); 44x44 is the AAA
    // ambition (2.5.5) and the practical one on a phone. Controls are held to
    // 44, plain text links to 24, because holding every link in a footer to 44
    // buries the real failures in noise.
    const isControl = tag === "BUTTON" || tag === "INPUT" || tag === "SELECT" || el.getAttribute("role") === "button";
    const isLink = tag === "A";
    if ((isControl || isLink) && r.width > 0 && r.height > 0) {
      // a link inside a sentence is exempt: WCAG's own inline exception
      const inText = isLink && el.parentElement ? ownText(el.parentElement).length > 0 : false;
      const floor = isControl ? 44 : 24;
      const small = Math.min(r.width, r.height) < floor;
      if (small && !inText) {
        out.push({
          level: isControl && narrow ? "fail" : "warn",
          rule: "target",
          msg: `tap target is ${Math.round(r.width)}×${Math.round(r.height)}, under the ${floor}px minimum for ${isControl ? "a control" : "a standalone link"}: ${shortLabel(el)}`,
          el,
        });
      }
    }

    const text = ownText(el);
    if (!text || r.width < 2) continue;
    const size = parseFloat(cs.fontSize) || 16;
    const weight = Number(cs.fontWeight) || 400;

    // contrast, on real painted colours
    const fg = parseColor(cs.color);
    const bg = fg ? effectiveBg(el) : null;
    if (fg && bg) {
      const solid = fg[3] < 1 ? over(fg, bg) : fg;
      const ratio = contrastRatio(solid, bg);
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const need = large ? 3 : 4.5;
      if (ratio < need) {
        const k = `${cs.color}|${bg.join()}|${Math.round(size)}`;
        if (!seenContrast.has(k)) {
          seenContrast.add(k);
          out.push({
            level: "fail",
            rule: "contrast",
            msg: `contrast ${ratio.toFixed(2)}:1 against its background, needs ${need}:1 at ${Math.round(size)}px — "${text.slice(0, 28)}"`,
            el,
          });
        }
      }
    }

    // body copy too small to read on a phone
    if (narrow && size < 16 && text.length > 40) {
      out.push({ level: "warn", rule: "type-size", msg: `body text at ${size.toFixed(1)}px on a ${win.innerWidth}px viewport (16px is the floor)`, el });
    }

    // measure: past ~75 characters a line is hard to track back from
    if (text.length > 120) {
      const ch = r.width / (size * 0.5);
      if (ch > 80) out.push({ level: "warn", rule: "measure", msg: `line length about ${Math.round(ch)} characters, cap the measure at 65–75ch`, el });
    }
  }

  // off-scale spacing, counted rather than listed: one warning, not forty
  let offScale = 0;
  const offenders: string[] = [];
  let firstOffender: HTMLElement | null = null;
  for (const el of els.slice(0, 1200)) {
    if (!isEditable(el)) continue;
    const cs = csOf(el);
    for (const p of ["marginTop", "marginBottom", "paddingTop", "paddingBottom"] as const) {
      const v = parseFloat(cs[p]) || 0;
      // under 4px is a hairline, not a spacing decision, and it is usually the
      // browser's own default button padding rather than anything a designer chose
      if (v >= 4 && Math.abs(v % 4) > 0.01) {
        offScale += 1;
        if (offenders.length < 3) {
          offenders.push(`${shortLabel(el)} ${p.replace("Top", "-top").replace("Bottom", "-bottom").replace("margin", "margin").replace("padding", "padding")}: ${Math.round(v * 10) / 10}px`);
          if (!firstOffender) firstOffender = el;
        }
      }
    }
  }
  if (offScale >= 3) {
    out.push({
      level: "warn",
      rule: "scale",
      msg: `${offScale} spacing values are not multiples of 4px, so the page has no single spacing scale. First few: ${offenders.join(" · ")}`,
      el: firstOffender,
    });
  }

  const order = { fail: 0, warn: 1 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
