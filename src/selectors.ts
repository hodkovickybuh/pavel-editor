/**
 * Element identification: turning a DOM node into something you can WRITE.
 *
 * This is the part that decides whether the editor is a toy or a tool. Anyone
 * can move a div with inline styles; the value is knowing that the div you just
 * moved is `.lead` in HeroFlow.module.css, and that nudging `.section` would
 * move every section on the site.
 */

import { csOf, edDoc, isElem } from "./context";

/**
 * The properties the inspector can write.
 *
 * NUMERIC ones are separate from the rest because they are the only ones that
 * can be dragged, nudged and snapped; a colour or a font family has no "one step
 * bigger". Everything else is declared in STYLE_PROPS below.
 */
export const PROPS = {
  "margin-top": { css: "marginTop", unit: "px", step: 1, min: -600 },
  "margin-bottom": { css: "marginBottom", unit: "px", step: 1, min: -600 },
  "margin-left": { css: "marginLeft", unit: "px", step: 1, min: -600 },
  "margin-right": { css: "marginRight", unit: "px", step: 1, min: -600 },
  "padding-top": { css: "paddingTop", unit: "px", step: 1, min: 0 },
  "padding-bottom": { css: "paddingBottom", unit: "px", step: 1, min: 0 },
  "padding-left": { css: "paddingLeft", unit: "px", step: 1, min: 0 },
  "padding-right": { css: "paddingRight", unit: "px", step: 1, min: 0 },
  gap: { css: "gap", unit: "px", step: 1, min: 0 },
  "row-gap": { css: "rowGap", unit: "px", step: 1, min: 0 },
  "column-gap": { css: "columnGap", unit: "px", step: 1, min: 0 },
  "max-width": { css: "maxWidth", unit: "px", step: 4, min: 0 },
  width: { css: "width", unit: "px", step: 1, min: 4 },
  height: { css: "height", unit: "px", step: 1, min: 4 },
  "font-size": { css: "fontSize", unit: "px", step: 1, min: 1 },
  "line-height": { css: "lineHeight", unit: "px", step: 1, min: 0 },
  "letter-spacing": { css: "letterSpacing", unit: "px", step: 0.1, min: -10 },
  "border-radius": { css: "borderRadius", unit: "px", step: 1, min: 0 },
  opacity: { css: "opacity", unit: "", step: 0.05, min: 0, max: 1 },
} as const;

export type NumProp = keyof typeof PROPS;

/** the inspector's grouping, so related controls sit together */
export const GROUPS: Array<{ title: string; props: NumProp[] }> = [
  { title: "spacing", props: ["margin-top", "margin-bottom", "margin-left", "margin-right"] },
  { title: "padding", props: ["padding-top", "padding-bottom", "padding-left", "padding-right"] },
  { title: "layout", props: ["width", "height", "max-width", "gap", "row-gap", "column-gap"] },
  { title: "type", props: ["font-size", "line-height", "letter-spacing"] },
  { title: "appearance", props: ["border-radius", "opacity"] },
];

/**
 * The non-numeric half of the inspector: colours, enums and free text.
 *
 * A note on scope, since the ask was "everything Figma has". Figma is a vector
 * canvas; a live page is a DOM. The tools that transfer are here in full
 * (typography, fill, stroke, corner radius, effects, and the flex controls that
 * are this medium's answer to auto-layout). The ones that do not transfer are
 * absent because they would be lies, not because they were skipped: there is no
 * pen tool, no boolean geometry, no component/variant library and no prototyping
 * layer, since none of those correspond to anything the stylesheet can express.
 */
export type StyleSpec =
  | { kind: "color"; css: string; label: string }
  | { kind: "enum"; css: string; label: string; options: string[] }
  | { kind: "text"; css: string; label: string; placeholder?: string };

export const STYLE_PROPS: Record<string, StyleSpec> = {
  color: { kind: "color", css: "color", label: "text" },
  "background-color": { kind: "color", css: "backgroundColor", label: "fill" },
  "border-color": { kind: "color", css: "borderColor", label: "stroke" },
  "font-family": { kind: "enum", css: "fontFamily", label: "font", options: [] },
  "font-weight": {
    kind: "enum",
    css: "fontWeight",
    label: "weight",
    options: ["300", "400", "500", "600", "700", "800", "900"],
  },
  "font-style": { kind: "enum", css: "fontStyle", label: "style", options: ["normal", "italic"] },
  "text-transform": {
    kind: "enum",
    css: "textTransform",
    label: "case",
    options: ["none", "uppercase", "lowercase", "capitalize"],
  },
  "text-align": {
    kind: "enum",
    css: "textAlign",
    label: "align",
    options: ["left", "center", "right", "justify"],
  },
  "text-decoration-line": {
    kind: "enum",
    css: "textDecorationLine",
    label: "decoration",
    options: ["none", "underline", "line-through"],
  },
  "white-space": {
    kind: "enum",
    css: "whiteSpace",
    label: "wrap",
    options: ["normal", "nowrap", "pre-wrap"],
  },
  display: {
    kind: "enum",
    css: "display",
    label: "display",
    options: ["block", "flex", "inline-flex", "grid", "inline-block", "none"],
  },
  "flex-direction": {
    kind: "enum",
    css: "flexDirection",
    label: "direction",
    options: ["row", "column", "row-reverse", "column-reverse"],
  },
  "justify-content": {
    kind: "enum",
    css: "justifyContent",
    label: "justify",
    options: ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"],
  },
  "align-items": {
    kind: "enum",
    css: "alignItems",
    label: "align items",
    options: ["stretch", "flex-start", "center", "flex-end", "baseline"],
  },
  "flex-wrap": { kind: "enum", css: "flexWrap", label: "wrap", options: ["nowrap", "wrap"] },
  position: {
    kind: "enum",
    css: "position",
    label: "position",
    options: ["static", "relative", "absolute", "fixed", "sticky"],
  },
  "border-style": {
    kind: "enum",
    css: "borderStyle",
    label: "stroke style",
    options: ["none", "solid", "dashed", "dotted"],
  },
  "box-shadow": { kind: "text", css: "boxShadow", label: "shadow", placeholder: "0 8px 24px rgba(0,0,0,.4)" },
  filter: { kind: "text", css: "filter", label: "filter", placeholder: "blur(4px)" },
  "backdrop-filter": { kind: "text", css: "backdropFilter", label: "backdrop", placeholder: "blur(10px)" },
  transform: { kind: "text", css: "transform", label: "transform", placeholder: "rotate(2deg)" },
  translate: { kind: "text", css: "translate", label: "translate", placeholder: "40px -12px" },
};

export type StyleProp = keyof typeof STYLE_PROPS;

/** how the non-numeric controls are grouped in the panel */
export const STYLE_GROUPS: Array<{ title: string; props: string[] }> = [
  {
    title: "typography",
    props: [
      "font-family",
      "font-weight",
      "font-style",
      "text-transform",
      "text-align",
      "text-decoration-line",
      "white-space",
      "color",
    ],
  },
  { title: "fill & stroke", props: ["background-color", "border-style", "border-color"] },
  { title: "flex", props: ["display", "flex-direction", "justify-content", "align-items", "flex-wrap"] },
  { title: "effects", props: ["box-shadow", "filter", "backdrop-filter", "translate", "transform", "position"] },
];

export function readStyle(el: HTMLElement, prop: string): string {
  const spec = STYLE_PROPS[prop];
  if (!spec) return "";
  const v = csOf(el)[spec.css as "color"] as string;
  return v ?? "";
}

/**
 * The font families the page actually loads, read off the document's own
 * elements rather than hard-coded. Offering a font the site has not loaded would
 * render a fallback and read as a bug.
 */
export function loadedFonts(): string[] {
  const seen = new Set<string>();
  for (const el of edDoc().querySelectorAll<HTMLElement>("body *")) {
    const f = csOf(el).fontFamily;
    if (f) seen.add(f);
    if (seen.size > 24) break;
  }
  return [...seen].sort();
}

/**
 * The design system's colour tokens, read from :root. Showing these as swatches
 * is the difference between a colour tool and a way to put an off-brand hex on
 * the site: the tokens are what the stylesheet is allowed to say.
 */
export function colorTokens(): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = [];
  const seen = new Set<string>();
  for (const sheet of Array.from(edDoc().styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin stylesheet, not readable, not ours
    }
    for (const rule of Array.from(rules)) {
      // duck-typed, not instanceof: the frame's CSSStyleRule is a different constructor
      const sr = rule as CSSStyleRule;
      if (typeof sr.selectorText !== "string" || !sr.selectorText.includes(":root")) continue;
      for (const prop of Array.from(sr.style)) {
        if (!prop.startsWith("--") || seen.has(prop)) continue;
        const raw = sr.style.getPropertyValue(prop).trim();
        // keep only the ones that resolve to a paintable colour
        const resolved = csOf(edDoc().documentElement).getPropertyValue(prop).trim();
        if (!/^(#|rgb|hsl|oklch|oklab|color-mix)/i.test(resolved || raw)) continue;
        seen.add(prop);
        out.push({ name: prop, value: `var(${prop})` });
      }
    }
  }
  return out.slice(0, 64);
}

/** a computed colour as #rrggbb, so it can seed an <input type="color"> */
export function toHex(color: string): string {
  const m = /^rgba?\(([^)]+)\)/.exec(color);
  if (!m) return /^#[0-9a-f]{6}$/i.test(color) ? color : "#000000";
  const [r, g, b] = m[1].split(",").map((n) => Math.round(parseFloat(n)));
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("")}`;
}

export const px = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export const round = (n: number, step: number) =>
  step >= 1 ? Math.round(n) : Math.round(n * 100) / 100;

/** read a property off the live element, in the unit the inspector writes */
export function readProp(el: HTMLElement, prop: NumProp): number {
  const cs = csOf(el);
  const raw = cs[PROPS[prop].css as "marginTop"];
  if (prop === "opacity") return round(px(raw), 0.05);
  if (prop === "line-height" && raw === "normal") return round(px(cs.fontSize) * 1.2, 1);
  if (prop === "letter-spacing" && raw === "normal") return 0;
  if (prop === "max-width" && (raw === "none" || !raw)) return round(el.getBoundingClientRect().width, 1);
  if (prop === "width" && (raw === "auto" || !raw)) return round(el.getBoundingClientRect().width, 1);
  if (prop === "height" && (raw === "auto" || !raw)) return round(el.getBoundingClientRect().height, 1);
  return round(px(raw), PROPS[prop].step);
}

/**
 * Decode a CSS-module class back to its source file and selector, so the report
 * can name the rule to edit instead of a hashed class. Every bundler mangles
 * differently, so this recognises the common shapes:
 *
 *   Next.js / webpack   HeroFlow-module__Hm6rHq__lead
 *   Vite                _lead_1a2b3_7
 *   CRA / css-loader    HeroFlow_lead__x7K2p
 *
 * A class that matches none of them is used as-is; the tool still works, the
 *  report just points at the literal class instead of a file.
 */
export function fromModuleClass(className: string) {
  let m = /^(.+?)-module__[^_]+__(.+)$/.exec(className);
  if (m) return { file: `${m[1]}.module.css`, selector: `.${m[2]}` };
  m = /^_([A-Za-z][\w-]*)_[a-z0-9]{5,}_\d+$/.exec(className);
  if (m) return { file: "(css module)", selector: `.${m[1]}` };
  m = /^([A-Z][A-Za-z0-9]*)_([a-z][\w-]*)__[A-Za-z0-9]{5,}$/.exec(className);
  if (m) return { file: `${m[1]}.module.css`, selector: `.${m[2]}` };
  return null;
}

/**
 * The element's most SPECIFIC CSS-module class. An element often carries two: a
 * shared primitive plus the component's own (a hero section is both
 * `Section-module__…__section` and `HeroFlow-module__…__section`). Editing the
 * primitive moves every section on the site, so rank by how many elements on the
 * page carry each class and take the rarest, which is the component's own.
 */
export function moduleClassOf(el: Element | null) {
  if (!el) return null;
  const hits = (el.getAttribute("class") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ raw, parsed: fromModuleClass(raw) }))
    .filter((h): h is { raw: string; parsed: NonNullable<ReturnType<typeof fromModuleClass>> } =>
      Boolean(h.parsed),
    );
  if (!hits.length) return null;
  hits.sort(
    (a, b) =>
      edDoc().getElementsByClassName(a.raw).length - edDoc().getElementsByClassName(b.raw).length,
  );
  return { ...hits[0].parsed, raw: hits[0].raw };
}

/** how many elements on the page a rule would move; > 1 means editing it is not local */
export function ruleReach(el: Element | null) {
  const own = moduleClassOf(el);
  return own ? edDoc().getElementsByClassName(own.raw).length : 1;
}

/**
 * The selector to WRITE, not the element's own class list. An element with no
 * CSS-module class of its own (a bare `h1`, a global `.eyebrow`) is still styled
 * from a module file through its parent, so climb to the nearest ancestor that
 * has one and express the target as a descendant: `.lead h1`, which is exactly
 * the rule already in HeroFlow.module.css. Without this the export named
 * `h1.text-display-hero`, a global utility class shared site-wide.
 */
export function describe(el: Element): { file: string | null; selector: string; label: string } {
  const own = moduleClassOf(el);
  if (own) return { ...own, label: `${own.file.replace(".module.css", "")} ${own.selector}` };

  let node = el.parentElement;
  let depth = 0;
  while (node && depth < 6) {
    const owner = moduleClassOf(node);
    if (owner) {
      const tag = el.tagName.toLowerCase();
      // Scoped by the owner already, so the tag alone is the cleanest rule
      // (`.lead h1`). Only reach for a global class when a same-tag sibling would
      // make the rule ambiguous, and even then it stays scoped.
      const sameTag = el.parentElement
        ? [...el.parentElement.children].filter((s) => s.tagName === el.tagName).length
        : 1;
      const globals = (el.getAttribute("class") ?? "")
        .split(/\s+/)
        .filter((c) => c && !c.includes("-module__"));
      const leaf = sameTag > 1 && globals.length ? `${tag}.${globals[0]}` : tag;
      const selector = `${owner.selector} ${leaf}`;
      return {
        file: owner.file,
        selector,
        label: `${owner.file.replace(".module.css", "")} ${selector}`,
      };
    }
    node = node.parentElement;
    depth += 1;
  }

  const classes = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
  const sel = classes.length
    ? `${el.tagName.toLowerCase()}.${classes[0]}`
    : el.tagName.toLowerCase();
  return { file: null, selector: sel, label: sel };
}

/** the short name shown in the layers tree and on hover chips */
export function shortLabel(el: Element) {
  const own = moduleClassOf(el);
  if (own) return own.selector;
  const tag = el.tagName.toLowerCase();
  const text = el.textContent?.trim().replace(/\s+/g, " ") ?? "";
  if (["h1", "h2", "h3", "h4", "p", "a", "button", "li", "span"].includes(tag) && text) {
    return `${tag} "${text.slice(0, 18)}${text.length > 18 ? "…" : ""}"`;
  }
  return tag;
}

/**
 * A human name for a whole section. Most sections carry only the shared
 * primitive class, so the class list cannot tell them apart; their heading can,
 * and it is also what the page is discussed by ("the split section").
 */
export function sectionLabel(el: Element, index: number) {
  const own = moduleClassOf(el);
  const file = own?.file.replace(".module.css", "");
  if (file && file !== "Section") return file;
  const heading = el.querySelector("h1, h2, h3, h4")?.textContent?.trim().replace(/\s+/g, " ");
  if (heading) return `"${heading.slice(0, 30)}${heading.length > 30 ? "…" : ""}"`;
  if (el.id) return `#${el.id}`;
  const first = el.classList?.[0];
  if (first) return `.${first} ${index + 1}`;
  return `${el.tagName.toLowerCase()} ${index + 1}`;
}

/**
 * A stable identity that survives a hot reload, so edits can be re-applied after
 * the dev server rebuilds. Structural rather than class-based, because CSS-module
 * hashes change between builds while the tree shape does not.
 */
/**
 * Only CONTENT elements count when indexing siblings. The parent page's body
 * carries script tags and the editor's own panel nodes that the device frame's
 * page does not, so raw nth-child indices differ between the two realms and a
 * path recorded in one failed to resolve in the other. Skipping the invisible
 * machinery makes the same page produce the same path in both.
 */
const PATH_SKIP = new Set(["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT", "TEMPLATE"]);
function pathKids(parent: Element): Element[] {
  return [...parent.children].filter(
    (c) => !PATH_SKIP.has(c.tagName) && !c.hasAttribute("data-editmode-ui"),
  );
}

export function domPath(el: Element) {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.tagName !== "BODY" && parts.length < 12) {
    const parent: Element | null = node.parentElement;
    const i = parent ? pathKids(parent).indexOf(node) : 0;
    parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${i + 1})`);
    node = parent;
  }
  return parts.join(">");
}

export function fromDomPath(path: string): HTMLElement | null {
  let node: Element | null = edDoc().body;
  for (const part of path.split(">")) {
    const m = /^(.+):nth-child\((\d+)\)$/.exec(part);
    if (!node || !m) return null;
    node = pathKids(node)[Number(m[2]) - 1] ?? null;
    if (!node || node.tagName.toLowerCase() !== m[1]) return null;
  }
  return (node as HTMLElement) ?? null;
}

/**
 * Which stylesheet rule ACTUALLY sets a property on this element. On sites with
 * no CSS modules the describe() fallback could only say "(global css) h1",
 * which forces the report's applier to hunt. This walks every readable sheet,
 * respects media queries, matches each selector against the element, and ranks
 * by specificity then source order, i.e. the cascade. Cached per element+prop:
 * a drag writes at frame rate and must not walk the CSSOM per frame.
 */
const winCache = new WeakMap<Element, Map<string, { selector: string; file: string } | null>>();
export function winningRuleFor(el: Element, prop: string): { selector: string; file: string } | null {
  let perEl = winCache.get(el);
  if (perEl?.has(prop)) return perEl.get(prop)!;
  const win = el.ownerDocument.defaultView ?? window;
  type Hit = { sel: string; file: string; spec: number; order: number };
  const state: { best: Hit | null } = { best: null };
  let order = 0;
  const walk = (rules: CSSRuleList, file: string) => {
    for (const r of Array.from(rules)) {
      order += 1;
      const name = r.constructor.name;
      if (name === "CSSMediaRule" || name === "CSSSupportsRule") {
        const grouped = r as CSSMediaRule;
        try {
          if (name === "CSSSupportsRule" || win.matchMedia(grouped.conditionText).matches) walk(grouped.cssRules, file);
        } catch {
          /* unparseable condition */
        }
        continue;
      }
      const sr = r as CSSStyleRule;
      if (typeof sr.selectorText !== "string" || !sr.style?.getPropertyValue(prop)) continue;
      for (const part of sr.selectorText.split(",")) {
        const p = part.trim();
        try {
          if (!el.matches(p)) continue;
        } catch {
          continue;
        }
        const spec =
          (p.match(/#/g)?.length ?? 0) * 100 +
          (p.match(/\.|\[|:(?!:)/g)?.length ?? 0) * 10 +
          (p.match(/(^|[\s>+~])[a-z]/gi)?.length ?? 0);
        const b = state.best;
        if (!b || spec > b.spec || (spec === b.spec && order >= b.order)) state.best = { sel: p, file, spec, order };
      }
    }
  };
  for (const sheet of Array.from(el.ownerDocument.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    walk(rules, sheet.href ? sheet.href.split("/").pop()! : "(inline <style>)");
  }
  const res = state.best ? { selector: state.best.sel, file: state.best.file } : null;
  if (!perEl) {
    perEl = new Map();
    winCache.set(el, perEl);
  }
  perEl.set(prop, res);
  return res;
}

/** the wrapper whose children are the page's top-level sections */
export function sectionWrap(): HTMLElement | null {
  const first = edDoc().querySelector("body section");
  return (first?.parentElement as HTMLElement | null) ?? null;
}

/**
 * The RUNTIME selector for "every element like this one": the hashed class
 * names as they exist in the live DOM, not the pretty source names the report
 * uses. `.HeroFlow-module__x__card` matches the page; `.card` does not.
 */
export function runtimeSelector(el: Element): string | null {
  const own = moduleClassOf(el);
  if (own) return `.${CSS.escape(own.raw)}`;
  let node = el.parentElement;
  let depth = 0;
  while (node && depth < 6) {
    const owner = moduleClassOf(node);
    if (owner) return `.${CSS.escape(owner.raw)} ${el.tagName.toLowerCase()}`;
    node = node.parentElement;
    depth += 1;
  }
  // no CSS module anywhere: a hand-written site says "elements like this one"
  // with a plain class, so the first class is the honest equivalent
  const first = el.classList?.[0];
  if (first) return `.${CSS.escape(first)}`;
  return null;
}

/**
 * The element's runtime selector plus its index among that selector's matches,
 * recorded on every change. This is the RESOLVER OF LAST RESORT: nth-child
 * paths shift between desktop and the device frame whenever a component mounts
 * children conditionally (the hero's terrain canvas exists only on desktop), so
 * a change recorded in one realm must be findable in the other by what the
 * element IS, not where it sits.
 */
export function runtimeRef(el: HTMLElement): { rtSel?: string; rtIdx?: number } {
  const sel = runtimeSelector(el);
  if (!sel) return {};
  try {
    const list = [...edDoc().querySelectorAll<HTMLElement>(sel)];
    const idx = list.indexOf(el);
    return idx >= 0 ? { rtSel: sel, rtIdx: idx } : { rtSel: sel };
  } catch {
    return {};
  }
}

/** all elements the selected one's rule also styles, the selection for "edit all" */
export function matchingElements(el: HTMLElement): HTMLElement[] {
  const sel = runtimeSelector(el);
  if (!sel) return [el];
  try {
    const all = [...edDoc().querySelectorAll<HTMLElement>(sel)].filter(isEditable);
    return all.length ? all : [el];
  } catch {
    return [el];
  }
}

/** tags that are a meaningful thing on their own, even without a class of their own */
const CONTENT_TAGS = new Set([
  "H1", "H2", "H3", "H4", "H5", "H6",
  "P", "A", "BUTTON", "IMG", "LI", "BLOCKQUOTE", "FIGURE", "SVG", "INPUT", "LABEL",
]);

/**
 * What a click should actually select.
 *
 * `elementFromPoint` returns the DEEPEST node under the cursor, which on this
 * site is routinely a `<span>` wrapping two words inside a button. Selecting
 * that is almost never what was meant, and worse, moving it moves type inside a
 * control rather than the control itself.
 *
 * So a click resolves to the nearest thing a person would call an object: an
 * element the design system authored (it has a CSS-module class), or a content
 * element that stands alone (a heading, a paragraph, a button, an image). This
 * is Figma's rule, where a click selects the group and you double-click to get
 * inside it; here double-click, ArrowRight and the layers tree all drill in.
 */
export function nearestBlock(el: HTMLElement): HTMLElement {
  let n: HTMLElement | null = el;
  while (n && n.tagName !== "BODY") {
    if (moduleClassOf(n) || CONTENT_TAGS.has(n.tagName)) return n;
    n = n.parentElement;
  }
  return el;
}

/** true for nodes the editor should never touch: its own UI and invisible chrome */
export function isEditable(el: Element): el is HTMLElement {
  if (!isElem(el)) return false;
  if (el.closest("[data-editmode-ui]")) return false;
  if (["SCRIPT", "STYLE", "HTML", "BODY", "HEAD", "LINK", "META"].includes(el.tagName)) return false;
  return true;
}
