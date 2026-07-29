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
  window.__PAVEL_EDITOR__ = true;
  const mount = () => {
    const host = document.createElement("div");
    host.setAttribute("data-editmode-ui", "");
    document.body.appendChild(host);
    createRoot(host).render(<EditMode standalone />);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
