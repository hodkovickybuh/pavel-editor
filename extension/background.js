// One click on the toolbar icon injects the editor into the current tab. This
// wrapper exists because page-injected scripts are blocked by strict CSP sites
// (github.com and friends); extension content scripts are not. Same bundle,
// copied in by the build; nothing else lives here.
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["pavel-editor.js"] });
});
