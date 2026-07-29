// One click on the toolbar icon injects the editor into the current tab.
// activeTab + the click IS the permission model: the user's gesture grants
// access to exactly that tab, nothing runs anywhere without it, and extension
// injection is exempt from the page's CSP (github.com and friends included).
// Same bundle, copied in by the build; nothing else lives here.
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["pavel-editor.js"] });
});
