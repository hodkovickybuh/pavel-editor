# The Guide

For designers, marketers, and anyone who has never touched code. Ten minutes and you will know the whole tool.

## What this is

PAVEL EDITOR lets you redesign a real, live website the way you would move things around in Figma. You are not editing a picture of the site, you are editing the site itself, in your browser, safely: nothing you do is permanent until a developer (or an AI assistant) applies your changes to the code. Think of it as annotating the building instead of the blueprint.

## Opening it

**Just want to see it?** Open the [live demo](https://hodkovickybuh.github.io/pavel-editor/demo/), no install, one click, the editor is already running there.

**Easiest, works everywhere: the Chrome extension.**
1. Download `pavel-editor-extension.zip` from the repository's **Releases** page and unzip it.
2. In Chrome, open `chrome://extensions`, switch on **Developer mode** (top right).
3. Click **Load unpacked** and pick the unzipped folder.
4. Pin PAVEL EDITOR to your toolbar. Now on ANY page, click the icon and the editor appears.

**If the site's developer wired it in** (like uzo.com's dev setup): add `?edit=1` to the end of the address, for example `http://localhost:3000/?edit=1`.

**One-off, no install:** open DevTools Console and paste the loader line from the README. This only works on pages YOU own (your localhost, your site). Strict sites like github.com refuse it with a "Content Security Policy" error; that is them, not you. The extension works there anyway.

## Your first five minutes

1. **Click something.** A blue outline with corner handles appears, and the panel shows everything about it: its size, whether it is centred, its spacing, its font, its colours.
2. **Drag it.** It moves. The number that changed shows up in the panel in mint.
3. **Drag its right or bottom edge.** It resizes, with a live size readout.
4. **Miss? Press ⌘Z.** Everything undoes, one clean step per action.
5. **Press the mint COPY FOR AI button.** Your whole session is now on the clipboard as a tidy list of changes. Paste it to whoever builds the site, human or AI, and say "apply this".

## The two move modes (the only concept to learn)

When you move something on a web page, everything BELOW it normally moves too; that is how web pages work, unlike Figma. The `solo | push` switch controls this:

- **solo** (the default): move only the thing you grabbed. Everything else stays put. This is the Figma feeling.
- **push**: the honest web behaviour, moving this pushes the content below it down. Use it when you want to see what the real page will do.

You never have to think about how; the report explains it to the developer.

## Everything else, in one table

| you want to | do this |
|---|---|
| select several things | drag a box around them, or shift+click |
| space three cards evenly | select them, press **≡ even gaps** |
| centre something | select it, press **⇹**; the centring readout always shows how far off-centre it is |
| see margins and paddings | toggle **spacing** (orange = margin, green = padding) |
| measure a distance | hold **⌥ option** and hover the other element |
| change the text | select it, press **⏎ enter**, type, press enter again |
| change font / size / colour | the TYPOGRAPHY group; colours offer the site's own palette first |
| restyle every matching card at once | tick **edit all N matching** |
| copy one element's look onto another | **⌘C** on the first, select the second, **⌘V** |
| leave a comment instead of an edit | press **N**, type ("this needs more drama"), enter |
| circle something, like a review | switch to **✎ mark**, draw around it, type the note |
| use responsive units | type `10vw`, `50%` or `40dvh` straight into any number field |
| preview on iPhone | press **device**, pick a size; you can keep editing inside it |
| edit desktop and phone separately | just edit at each size; changes only apply at the size you made them |
| match a design mock | **reference** row at the panel's foot: load the image, set opacity |
| edit margins/padding visually | the nested box diagram in the panel; click any number in it |
| compare with the original | press **before/after**; click again to come back |
| try two directions | **variants**: click **A +** to save, edit differently, **B +**, then click A/B to compare |
| swap a photo | drag an image file from your desktop onto any image on the page |
| move whole sections | press **Tab**, then drag sections up or down |
| hide something | select it, press **⌫ backspace** |
| take a break | press **✕**; a small EDIT pill stays in the corner to come back |

## What the report means

Every edit you make is remembered with what it was before, what it is now, and, when the site's code allows it, exactly which file and rule it belongs to. Notes ride along as instructions. Changes you made while previewing a phone size are marked so they only affect phones. Hand the report over and the site gets your design, for real, in code.

## What it deliberately does not do

It will not save changes to the site by itself; that is the point. It has no pen tool, no vector shapes, no component library, because a live web page has no honest equivalent of those. Everything it does maps one-to-one to something real in the site's code.
