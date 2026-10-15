import api from "./api";

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
    const res = await api.post(`/reports/generate/${id}`, {}, { responseType: "blob" });
    return res.data;
  },
};
