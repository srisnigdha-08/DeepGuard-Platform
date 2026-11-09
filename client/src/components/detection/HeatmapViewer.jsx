import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Download, ZoomIn, Loader2, AlertCircle } from "lucide-react";
import { detectionService } from "../../services/detectionService";

/**
 * Interactive Grad-CAM heatmap viewer.
 *
 * Supports inline base64 payloads as well as authenticated protected heatmap endpoints.
 * Automatically fetches protected heatmap blobs with Authorization headers and releases
 * object URLs on unmount/update to prevent memory leaks.
 */
export default function HeatmapViewer({ faceBase64, heatmapBase64, heatmapUrl, regions = [] }) {
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // Active base64 selection
  const activeBase64 = showHeatmap ? (heatmapBase64 || faceBase64) : (faceBase64 || heatmapBase64);
  const activeDataUri = activeBase64
    ? (activeBase64.startsWith("data:") || activeBase64.startsWith("blob:")
        ? activeBase64
        : `data:image/jpeg;base64,${activeBase64}`)
    : null;

  // When no inline base64 is present but a protected heatmapUrl is provided, fetch via authenticated API
  useEffect(() => {
    if (activeDataUri || !heatmapUrl) {
      return;
    }

    let isMounted = true;
    let createdUrl = null;
    setLoading(true);
    setFetchError(null);

    detectionService
      .getHeatmapBlob(heatmapUrl)
      .then((blob) => {
        if (!isMounted) return;
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setFetchError("Unable to load protected heatmap");
        setLoading(false);
      });

    return () => {
      isMounted = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [activeDataUri, heatmapUrl, showHeatmap]);

  const imgSrc = activeDataUri || blobUrl;

  const download = () => {
    if (!imgSrc) return;
    const a = document.createElement("a");
    a.href = imgSrc;
    a.download = showHeatmap ? "gradcam_heatmap.jpg" : "face_crop.jpg";
    a.click();
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Grad-CAM Explainability</h3>
          <p className="text-2xs text-text-muted mt-0.5">
            Red = highest manipulation probability · Blue = authentic
          </p>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setShowHeatmap(v => !v)} className="btn-ghost py-1.5 px-2.5 text-xs">
            {showHeatmap ? <><EyeOff size={13} /> Original</> : <><Eye size={13} /> Heatmap</>}
          </button>
          <button onClick={() => setZoomed(v => !v)} className="btn-ghost py-1.5 px-2.5">
            <ZoomIn size={14} />
          </button>
          <button onClick={download} disabled={!imgSrc} className="btn-ghost py-1.5 px-2.5 disabled:opacity-50">
            <Download size={14} />
          </button>
        </div>
      </div>

      {/* Image */}
      <div className={`relative rounded-lg overflow-hidden bg-surface-100 border border-surface-300 ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
           onClick={() => setZoomed(v => !v)}>
        <AnimatePresence mode="wait">
          {loading ? (
            <div className="h-48 flex flex-col items-center justify-center gap-2 text-text-muted text-sm">
              <Loader2 className="animate-spin text-accent-cyan" size={24} />
              <span>Loading protected heatmap...</span>
            </div>
          ) : fetchError ? (
            <div className="h-48 flex flex-col items-center justify-center gap-1.5 text-danger text-sm">
              <AlertCircle size={20} />
              <span>{fetchError}</span>
            </div>
          ) : imgSrc ? (
            <motion.img
              key={showHeatmap ? (imgSrc.slice(-15) + "_hm") : (imgSrc.slice(-15) + "_orig")}
              src={imgSrc}
              alt={showHeatmap ? "Grad-CAM heatmap" : "Original face crop"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={`w-full object-contain transition-all duration-300 ${zoomed ? "max-h-96" : "max-h-64"}`}
            />
          ) : (
            <div className="h-48 flex items-center justify-center text-text-muted text-sm">
              No heatmap available
            </div>
          )}
        </AnimatePresence>
        <div className="absolute bottom-2 left-2">
          <span className="text-2xs px-2 py-0.5 rounded-full bg-black/60 text-white font-medium">
            {showHeatmap ? "Grad-CAM View" : "Original"}
          </span>
        </div>
      </div>

      {/* Suspicious regions list */}
      {regions.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-2xs text-text-muted uppercase tracking-wide font-medium">
            Detected Regions ({regions.length})
          </p>
          {regions.slice(0, 5).map((r, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded bg-surface-100 border border-surface-300">
              <span className="text-xs text-text-secondary">
                Region {i + 1} — {r.width}×{r.height}px @ ({r.x},{r.y})
              </span>
              <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full
                ${r.suspicionLevel === "high"   ? "bg-danger/10 text-danger"
                : r.suspicionLevel === "medium" ? "bg-warning/10 text-warning"
                : "bg-surface-200 text-text-muted"}`}>
                {r.suspicionLevel}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
