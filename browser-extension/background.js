// WHY service worker not persistent background page?
// Manifest V3 requires service workers for background scripts.
// Service workers are event-driven — they wake up on events and sleep otherwise.
// This reduces Chrome's memory usage compared to persistent background pages.

const API_BASE = "http://localhost:5000/api"; // Change to Render URL for production

// Register right-click context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id:       "analyze-deepguard",
    title:    "🔍 Analyze with DeepGuard",
    contexts: ["image", "video"],
  });
});

// Handle right-click → analyze
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "analyze-deepguard") return;

  // Show "analyzing" state in badge
  chrome.action.setBadgeText({ text: "…", tabId: tab.id });
  chrome.action.setBadgeBackgroundColor({ color: "#6366f1", tabId: tab.id });

  try {
    // Check token exists
    const { authToken } = await chrome.storage.local.get("authToken");
    if (!authToken) {
      chrome.action.setBadgeText({ text: "!", tabId: tab.id });
      chrome.action.setBadgeBackgroundColor({ color: "#f59e0b", tabId: tab.id });
      return;
    }

    // Fetch the media from the page URL
    const response = await fetch(info.srcUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();

    // Submit to DeepGuard API
    const form = new FormData();
    form.append("file", blob, "extension-capture.jpg");

    const apiRes = await fetch(`${API_BASE}/detect/image`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${authToken}` },
      body:    form,
    });

    if (!apiRes.ok) {
      const err = await apiRes.json().catch(() => ({}));
      throw new Error(err.message || `API ${apiRes.status}`);
    }

    const { data: result } = await apiRes.json();
    const isFake = result?.isFake;

    // Update badge with verdict
    chrome.action.setBadgeText({ text: isFake ? "FAKE" : "REAL", tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: isFake ? "#ef4444" : "#22c55e", tabId: tab.id });

    // Persist result for popup display
    chrome.storage.local.set({
      lastResult: { ...result, analyzedUrl: info.srcUrl, analyzedAt: new Date().toISOString() },
    });

  } catch (err) {
    console.error("[DeepGuard]", err.message);
    chrome.action.setBadgeText({ text: "ERR", tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#6b7280", tabId: tab.id });
  }
});

// Respond to popup requests
chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  if (msg.action === "GET_LAST_RESULT") {
    chrome.storage.local.get("lastResult", data => sendResponse(data.lastResult || null));
    return true; // keep channel open for async response
  }
});
