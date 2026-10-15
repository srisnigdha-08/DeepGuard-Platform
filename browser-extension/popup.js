document.addEventListener("DOMContentLoaded", async () => {
  const container  = document.getElementById("result-container");
  const tokenInput = document.getElementById("token-input");
  const saveBtn    = document.getElementById("save-btn");
  const statusMsg  = document.getElementById("status-msg");

  // Restore saved token (show masked)
  const { authToken } = await chrome.storage.local.get("authToken");
  if (authToken) {
    tokenInput.placeholder = "Token saved (" + authToken.slice(0, 12) + "…)";
  }

  // Save token
  saveBtn.addEventListener("click", async () => {
    const token = tokenInput.value.trim();
    if (!token) return;
    await chrome.storage.local.set({ authToken: token });
    tokenInput.value = "";
    tokenInput.placeholder = "Token saved (" + token.slice(0, 12) + "…)";
    statusMsg.textContent = "✅ Token saved successfully!";
    setTimeout(() => { statusMsg.textContent = "Right-click any image → Analyze with DeepGuard"; }, 3000);
  });

  // Load last analysis result
  const result = await chrome.runtime.sendMessage({ action: "GET_LAST_RESULT" });
  if (result) {
    const isFake = result.isFake;
    container.innerHTML = `
      <div class="result">
        <div class="verdict ${isFake ? "fake" : "real"}">
          ${isFake ? "⚠ FAKE" : "✓ REAL"}
        </div>
        <div class="conf">
          Confidence: ${result.confidencePercent?.toFixed(1) ?? "—"}%
          &nbsp;·&nbsp; ${result.mediaType ?? ""}
        </div>
        <div class="file" title="${result.analyzedUrl ?? ""}">
          ${result.analyzedUrl ? result.analyzedUrl.slice(0, 55) + "…" : "Unknown source"}
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="empty">
        No recent analysis.<br>
        Right-click an image on any webpage<br>
        and select "Analyze with DeepGuard".
      </div>
    `;
  }
});
