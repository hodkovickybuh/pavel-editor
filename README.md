# PAVEL EDITOR

A Figma-style visual editor that runs inside any live web page. Click things, drag them, restyle them, pin notes, preview at device sizes, then press one button and hand the whole session to your AI assistant as a report it can apply to your real stylesheets.

No build step, no framework requirement, no server. One script tag.

## Use it

On any page (yours or a friend's project):

```html
<script src="https://cdn.jsdelivr.net/gh/hodkovickybuh/pavel-editor@main/dist/pavel-editor.js"></script>
```

Or paste this in the browser console on a running page:

```js
var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/gh/hodkovickybuh/pavel-editor@main/dist/pavel-editor.js';document.body.appendChild(s);
```

In a Next.js app, load it in development only:

```tsx
{process.env.NODE_ENV === "development" && (
  <script src="https://cdn.jsdelivr.net/gh/hodkovickybuh/pavel-editor@main/dist/pavel-editor.js" async />
)}
```

The panel appears top right. The page's own links and buttons are disabled while the editor is on; press the x to collapse it to an EDIT pill and get the page back.

## What it does

| | |
|---|---|
| **Select** | click · shift+click adds · drag a box for several · double-click drills into a group · ←/→ walk the tree · esc deselects |
| **Move** | drag any selected element. `push` mode is honest CSS (followers move too); `isolate` moves the element alone by compensating its own margin-bottom |
| **Snap** | sibling-edge guides plus a 4px grid while dragging; alt suspends snapping |
| **Measure** | alt+hover any other element for Figma-style distance readouts; a centring readout shows exactly how off-centre a selection is |
| **Inspect** | margins, padding, gaps, max-width, typography, colours, shadows, flex controls. Labels scrub like Figma inputs (drag them; shift x10, alt fine) |
| **Colour** | your design tokens (the `:root` CSS variables) as swatches first, then a native picker and the system eyedropper |
| **Scope** | "edit all N matching" applies a change to every element sharing the rule |
| **Text** | press enter on a selection and type |
| **Notes** | press N, type intent ("this needs more drama"); notes pin to elements and export with the report |
| **Style clipboard** | cmd+C copies an element's visual style, cmd+V applies it to another |
| **Device frame** | Chrome-style viewport emulator (iPhone/iPad/laptop presets, custom sizes, rotate). It is a real viewport: your phone CSS actually runs, and edits made there are tagged so they land in the right media query |
| **History** | cmd+Z / shift+cmd+Z across everything; a drag or a scrub is one step. Edits survive reloads and hot reloads |
| **Sections** | Tab switches to section mode; drag whole page sections to reorder |

## The report

`COPY FOR AI` puts a structured report on the clipboard. When the site uses CSS modules, hashed classes are decoded back to their source file and selector, so the report reads like a patch:

```
STYLE CHANGES (desktop viewport)
  HeroFlow.module.css
    .lead h1 {
      margin-top: 56px;   /* was 16px */
    }

STYLE CHANGES MADE AT A NARROW VIEWPORT (scope these in the phone media query)
  ...

NOTES (design intent, no CSS attached; act on these too)
  HeroFlow .lead h1: make this bolder
```

Paste it to Claude (or any assistant) and ask it to apply the changes to the stylesheets.

## Notes on honesty

The editor edits inline styles on the live DOM. That is a preview, not a deploy: the report is the artefact, your stylesheet is the source of truth. Duplicating an element is preview-only and says so. Section reorder is preview-only and a refresh restores it. When a rule you are editing is shared, the panel warns you how many elements it moves.

## Develop

```
bun install
bun run build     # dist/pavel-editor.js
bun run typecheck
```

MIT.
