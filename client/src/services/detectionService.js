//
import api from "./api";

const mkForm = (file) => {
  const f = new FormData();
  f.append("file", file);
  return f;
};

export const detectionService = {
  analyzeImage: async (file, onProgress) => {
    const { data } = await api.post("/detect/image", mkForm(file), {
      onUploadProgress: (e) =>
        onProgress?.(Math.round((e.loaded * 100) / e.total)),
    });

    return data.data;
  },

  analyzeVideo: async (file, onProgress) => {
    const { data } = await api.post("/detect/video", mkForm(file), {
      timeout: 120_000,
      onUploadProgress: (e) =>
        onProgress?.(Math.round((e.loaded * 100) / e.total)),
    });

    return data.data;
  },

  analyzeAudio: async () => {
    throw new Error("Audio deepfake detection is currently unavailable (model training in progress).");
  },

  getResult: async (id) => {
    const { data } = await api.get(`/detect/result/${id}`);
    return data.data;
  },
};
