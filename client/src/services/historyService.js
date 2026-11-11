import api from "./api";

/**
 * Robust cross-browser blob download trigger.
 * Appends link to document.body, triggers click, and safely cleans up
 * object URL after asynchronous browser download dispatch.
 */
export function triggerBlobDownload(blobData, filename = "deepguard-report.pdf") {
  const blob = blobData instanceof Blob ? blobData : new Blob([blobData], { type: "application/pdf" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      if (a.parentNode) {
        a.parentNode.removeChild(a);
      }
      window.URL.revokeObjectURL(url);
    } catch (_) {
      // Cleanup error swallowed safely
    }
  }, 1000);
}

export const historyService = {
  getHistory: async params => {
    const { data } = await api.get("/history", { params });
    return data.data;
  },
  getResult:    async id => { const { data } = await api.get(`/history/${id}`);       return data.data; },
  deleteResult: async id => { await api.delete(`/history/${id}`); },
  getAnalytics: async ()  => { const { data } = await api.get("/reports/analytics"); return data.data; },
  generateReport: async id => {
    // WHY responseType: "blob"? PDF is binary. Without this Axios tries to
    // parse the response as JSON and corrupts the binary data.
    try {
      const res = await api.get(`/reports/${id}/pdf`, { responseType: "blob" });
      return res.data;
    } catch (_) {
      // Fallback to POST /reports/generate/:id if GET fails
      const res = await api.post(`/reports/generate/${id}`, {}, { responseType: "blob" });
      return res.data;
    }
  },
  downloadReport: async (id, filename) => {
    const blob = await historyService.generateReport(id);
    triggerBlobDownload(blob, filename || `deepguard-report-${id}.pdf`);
    return true;
  },
};
