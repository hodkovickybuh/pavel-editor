/**
 * The self-mounting entry: everything the host page needs to do is load this
 * script. No host React, no build step, no framework assumptions; the bundle
 * carries its own React and renders into a container it creates itself. The
 * container carries data-editmode-ui so the editor never inspects its own UI.
 */
import { createRoot } from "react-dom/client";
import { EditMode } from "./index";

declare global {
  interface Window {
    __PAVEL_EDITOR__?: boolean;
  }
}

(() => {
  // inside the editor's own device frame the PARENT is the editor; a second
  // copy in here would stack panel on panel
  if (new URLSearchParams(window.location.search).has("pe-frame") || window.name === "pavel-editor-frame") return;
  const w = window as unknown as { __PAVEL_EDITOR__?: boolean; __PAVEL_EDITOR_UNMOUNT__?: () => void };
  if (w.__PAVEL_EDITOR__) {
    // a second load is the user ASKING AGAIN (toolbar re-click, console line
    // pasted twice) after hiding the editor with ✕. Returning silently was a
    // dead end: the only way back was the corner pill, and on a page with its
    // own bottom-right widget that pill is easy to miss. Wake the live copy.
    if (document.querySelector("[data-editmode-ui]")) {
      window.dispatchEvent(new Event("pavel-editor:show"));
      return;
    }
    // flag set but nothing on the page: the host framework wiped the mount
    // (route change, hydration). Retire the corpse and mount fresh.
    try {
      w.__PAVEL_EDITOR_UNMOUNT__?.();
    } catch {
      /* already gone */
    }
  }
  w.__PAVEL_EDITOR__ = true;
  const mount = () => {
    const host = document.createElement("div");
    host.setAttribute("data-editmode-ui", "");
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(<EditMode standalone />);
    // the retire hook: when this page ends up inside a NEWER editor's device
    // frame (mixed bundle versions from caches), the parent calls this to shut
    // the embedded copy down cleanly instead of stacking panel on panel
    (window as unknown as { __PAVEL_EDITOR_UNMOUNT__?: () => void }).__PAVEL_EDITOR_UNMOUNT__ = () => {
      root.unmount();
      host.remove();
    };
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
