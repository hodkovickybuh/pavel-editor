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
  if (window.__PAVEL_EDITOR__) return; // loading twice must not mount twice
  // inside the editor's own device frame the PARENT is the editor; a second
  // copy in here would stack panel on panel
  if (new URLSearchParams(window.location.search).has("pe-frame") || window.name === "pavel-editor-frame") return;
  window.__PAVEL_EDITOR__ = true;
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
