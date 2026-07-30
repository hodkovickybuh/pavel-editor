<div align="center">

![PAVEL EDITOR](assets/banner.jpg)

**A Figma-style visual editor that runs inside any live web page.**

Click things. Drag them. Restyle them. Preview on any device. Circle what bothers you.
Then press one button and hand the whole session to your AI assistant as a report it applies to your real stylesheets.

<br>

[![Download the Chrome extension](https://img.shields.io/badge/%E2%AC%87%EF%B8%8E%20%20Download%20the%20Chrome%20extension-B2D5E5?style=for-the-badge&labelColor=23212C)](https://github.com/hodkovickybuh/pavel-editor/releases/latest/download/pavel-editor-extension.zip)
[![Try the live demo](https://img.shields.io/badge/%E2%96%B6%20%20Try%20the%20live%20demo-99E1D9?style=for-the-badge&labelColor=23212C)](https://hodkovickybuh.github.io/pavel-editor/demo/)
[![Read the guide](https://img.shields.io/badge/%F0%9F%93%96%20%20Read%20the%20guide-8a86a8?style=for-the-badge&labelColor=23212C)](GUIDE.md)

[![release](https://img.shields.io/github/v/release/hodkovickybuh/pavel-editor?style=flat-square&color=99E1D9&labelColor=23212C)](https://github.com/hodkovickybuh/pavel-editor/releases)
[![downloads](https://img.shields.io/github/downloads/hodkovickybuh/pavel-editor/total?style=flat-square&color=B2D5E5&labelColor=23212C)](https://github.com/hodkovickybuh/pavel-editor/releases)
![license](https://img.shields.io/badge/license-MIT-8a86a8?style=flat-square&labelColor=23212C)

<br>

![PAVEL EDITOR](assets/editor.png)

</div>

## Get it

**The Chrome extension is the way.** It works on every site, including the ones that block scripts (github.com, banks, most big products). [**⬇ Download the zip**](https://github.com/hodkovickybuh/pavel-editor/releases/latest/download/pavel-editor-extension.zip) (always the newest version), unzip it, then:

```
1. chrome://extensions → turn on Developer mode (top right)
2. Load unpacked → pick the unzipped folder
3. Pin PAVEL EDITOR · click its icon on any page
```

![the extension editing github.com itself](assets/extension-on-github.png)

**Script tag**, for a site you own (pin a release tag, `@main` caches for hours):

```html
<script src="https://cdn.jsdelivr.net/gh/hodkovickybuh/pavel-editor@v1.9.1/dist/pavel-editor.js"></script>
```

<details>
<summary><b>Console one-liner</b> · ⚠ read this first: it only works on pages YOU own</summary>

Sites you do not control (github.com, banks, most big products) send a Content-Security-Policy that blocks ALL outside scripts. Pasting this there produces a "violates the following Content Security Policy" error every time; that is the site refusing, not the editor breaking. **It cannot be tested on github.com.** To just try the editor, use the [live demo](https://hodkovickybuh.github.io/pavel-editor/demo/) or the extension. On your own localhost or site, paste away:

```js
var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/gh/hodkovickybuh/pavel-editor@v1.9.1/dist/pavel-editor.js';document.body.appendChild(s);
```

</details>

> New to this? Read **[the Guide](GUIDE.md)**, written for designers who never touch code.

## What it does

| | |
|---|---|
| **Select** | click · shift+click · marquee · double-click drills into groups · ←/→ walks the tree |
| **Move** | drag anything, anywhere, both axes. `solo` (default) moves just that element via `translate`, nothing else shifts; `push` shows honest CSS flow |
| **Resize** | drag the right/bottom edge, live W×H readout |
| **Snap & measure** | sibling-edge guides, 4px grid, alt+hover distances, a permanent centring readout |
| **Inspect** | margins, padding, size, gaps, typography, colour, shadows, flex, with scrubbable Figma-style inputs |
| **Colour** | the site's own design tokens as swatches first, then a picker and the system eyedropper |
| **Scope** | "edit all N matching" restyles every element sharing the rule at once |
| **Text** | enter to edit copy inline |
| **Notes** | N pins design intent to an element; notes export with the report |
| **Mark** | circle anything freehand, review-style, and attach a note to the circled element |
| **Units** | drag measures in px; type `10vw`, `50%`, `40dvh`, `3rem` into any field and it is written as authored |
| **Style clipboard** | ⌘C / ⌘V copies the look of one element onto another |
| **Device frame** | a real viewport emulator (iPhone/iPad/laptop presets, custom, rotate); phone CSS actually runs, and phone-made edits are tagged for the right media query |
| **Reorder** | drag a card inside a flex/grid row to change its place, auto-layout style; alt+drag moves freely instead |
| **Hover x-ray** | hovering anything shades its margins and padding, DevTools style |
| **Winning rule** | on plain-CSS sites the report names the actual stylesheet rule that sets each property |
| **Self-healing** | if the site's own code re-renders, your edits re-apply and dead selections release |
| **Box model** | the DevTools diagram, but editable: click any margin/padding/size number in place |
| **Before / after** | one button flips the whole page between the original and your edits |
| **A/B variants** | save two directions, click between them, ship the winner |
| **Image swap** | drop a file onto any image; the report names the file for whoever places the asset |
| **Sections** | Tab, then drag whole page sections to reorder |
| **History** | ⌘Z across everything, one step per gesture, survives reloads and hot reloads |
| **Real breakpoints** | bands are read from the page's OWN media queries, so a value set at 768px, one set at 390px and one set on desktop are three independent values that never overwrite each other |
| **States** | edit `hover`, `focus-visible` and `active` values, shown at rest while you work on them, reported as their own `:hover` rule |
| **Use the page** | one button hands the page back: open a menu, fill a form, run a carousel, then edit the state you just reached |
| **Audit** | contrast on real painted colours, tap targets, alt text, missing focus styles, sideways overflow, line measure, off-scale spacing. Click a finding to jump to it |
| **Tokens** | `◇` on any number writes `var(--space-6)` instead of `24px`, and a value that already equals a token says so in the report |
| **Tailwind** | on a Tailwind page every change also reports the class (`sm:max-lg:pt-8`), and warns you not to edit the shared utility rule |
| **Cascade honesty** | if a more specific rule already sets the property, the report says the plain rule will LOSE, and names the rival. The preview wins with `!important`; the report never pretends that is the fix |
| **Motion** | transition and animation are editable, and `⏸ motion` rehearses `prefers-reduced-motion` with everything off |
| **Bridge** | run `npx pavel-editor-bridge` in the project and the button becomes **APPLY TO CODE**: the report lands in `.pavel-editor/` and prints in that terminal, where your agent is already looking |
| **Handoff** | save the whole session as a file; anyone with the codebase loads it and sees the identical page, notes and marks included |

![multi-select](assets/multiselect.png)
![resize](assets/resize.png)

## The report

`COPY FOR AI` exports the session. Hashed CSS-module classes are decoded back to their source file and selector, so the report reads like a patch:

```
PAVEL EDITOR REPORT   /   viewport 1560x960

STYLE CHANGES MADE AT 1025PX AND WIDER — these belong inside @media (min-width: 1025px) and must NOT touch the base rule
  HeroFlow.module.css
    .lead h1 {
      margin-top: 56px;   /* was 16px · THIS EQUALS THE TOKEN var(--space-14) — write the token, not the number */
    }
    .lead h1:hover {
      color: #fff;   /* was #e8e8ea */
    }

STYLE CHANGES MADE AT UP TO 640PX — these belong inside @media (max-width: 640px) and must NOT touch the base rule
  Cards.module.css
    .card {
      padding-top: 24px;   /* was 17px · tailwind: max-sm:pt-6 · CASCADE: ".grid .card in app.css" already sets this and is at least as specific. The editor's preview only held because it writes !important; this rule as written will LOSE. */
    }

NOTES (design intent, no CSS attached; act on these too)
  section.hero a.cta: make this pop way more
```

Paste it to Claude, Cursor, or a colleague, or run the bridge and let it go straight to the project. The stylesheet stays the source of truth; the editor is the conversation about it.

![changes](assets/changes.png)
![device](assets/device.png)

## Honesty rules

The editor previews through one injected stylesheet, scoped to the media query of the band you were in; it never writes your code, and the bridge does not either. Duplicates are preview-only and say so. Section reorder is preview-only; refresh restores. Editing a shared rule warns you how many elements it moves. When the preview only held because of `!important`, the report says the plain rule will lose instead of letting you find out later. There is no pen tool and no components, because a live page has no honest equivalent.

## Develop

```
bun install
bun run build       # dist/pavel-editor.js + extension/pavel-editor.js
bun run typecheck
bun run bridge      # the APPLY TO CODE endpoint, in the project you are editing
```

Releases are pinned tags, never `@main`: jsDelivr caches `@main` for hours and its purge is best-effort, which has served a stale build more than once. Cut a tag, then bump the tag in the consumers.

MIT · built by Pavel with Claude
