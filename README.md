<div align="center">

# ✎ PAVEL EDITOR

**A Figma-style visual editor that runs inside any live web page.**

Click things. Drag them. Restyle them. Preview on any device. Pin notes.
Then press one button and hand the whole session to your AI assistant as a report it applies to your real stylesheets.

*No build step · no framework requirement · no server · one script*

![PAVEL EDITOR](assets/editor.png)

</div>

## Get it

**Chrome extension** (works on every site, even ones that block scripts):

```
1. Code → Download ZIP → unzip
2. chrome://extensions → Developer mode ON → Load unpacked → pick the extension/ folder
3. Pin it. Click the icon on any page.
```

**Script tag** (for a site you own):

```html
<script src="https://cdn.jsdelivr.net/gh/hodkovickybuh/pavel-editor@main/dist/pavel-editor.js"></script>
```

**Console one-liner** (any running page; strict-CSP sites like github.com will refuse this, use the extension there):

```js
var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/gh/hodkovickybuh/pavel-editor@main/dist/pavel-editor.js';document.body.appendChild(s);
```

**Next.js, dev only** (gated behind `?edit=1`): see `docs/nextjs-loader.md` pattern in the guide.

**Try it right now**: clone and open `demo/index.html`.

> New to this? Read **[the Guide](GUIDE.md)**, written for designers who never touch code.

## What it does

| | |
|---|---|
| **Select** | click · shift+click · marquee · double-click drills into groups · ←/→ walks the tree |
| **Move** | drag anything. `solo` moves just that element (the Figma feeling); `push` shows honest CSS flow |
| **Resize** | drag the right/bottom edge, live W×H readout |
| **Snap & measure** | sibling-edge guides, 4px grid, alt+hover distances, a permanent centring readout |
| **Inspect** | margins, padding, size, gaps, typography, colour, shadows, flex, with scrubbable Figma-style inputs |
| **Colour** | the site's own design tokens as swatches first, then a picker and the system eyedropper |
| **Scope** | "edit all N matching" restyles every element sharing the rule at once |
| **Text** | enter to edit copy inline |
| **Notes** | N pins design intent to an element; notes export with the report |
| **Style clipboard** | ⌘C / ⌘V copies the look of one element onto another |
| **Device frame** | a real viewport emulator (iPhone/iPad/laptop presets, custom, rotate); phone CSS actually runs, and phone-made edits are tagged for the right media query |
| **Sections** | Tab, then drag whole page sections to reorder |
| **History** | ⌘Z across everything, one step per gesture, survives reloads and hot reloads |

![multi-select](assets/multiselect.png)

## The report

`COPY FOR AI` exports the session. Hashed CSS-module classes are decoded back to their source file and selector, so the report reads like a patch:

```
PAVEL EDITOR REPORT   /   viewport 1560x960

STYLE CHANGES (desktop viewport)
  HeroFlow.module.css
    .lead h1 {
      margin-top: 56px;   /* was 16px */
    }

STYLE CHANGES MADE AT A NARROW VIEWPORT (scope these in the phone media query)
  ...

NOTES (design intent, no CSS attached; act on these too)
  section.hero a.cta: make this pop way more
```

Paste it to Claude, Cursor, or a colleague. The stylesheet stays the source of truth; the editor is the conversation about it.

![changes](assets/changes.png)
![device](assets/device.png)

## Honesty rules

The editor previews with inline styles on the live DOM; it never writes your code. Duplicates are preview-only and say so. Section reorder is preview-only; refresh restores. Editing a shared rule warns you how many elements it moves. There is no pen tool and no components, because a live page has no honest equivalent.

## Develop

```
bun install
bun run build       # dist/pavel-editor.js + extension/pavel-editor.js
bun run typecheck
```

After pushing an update, purge the CDN: `curl https://purge.jsdelivr.net/gh/hodkovickybuh/pavel-editor@main/dist/pavel-editor.js`

MIT · built by Pavel with Claude
