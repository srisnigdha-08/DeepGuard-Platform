import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Download, ZoomIn } from "lucide-react";

/**
 * Interactive Grad-CAM heatmap viewer.
 *
 * WHY base64 over URL for heatmap?
 * Base64 arrives inline with the API response — no second HTTP request.
 * For large deployments, switch to pre-signed S3 URLs to avoid bloating
 * the JSON payload (base64 is ~33% larger than binary).
 */
export default function HeatmapViewer({ faceBase64, heatmapBase64, heatmapUrl, regions = [] }) {
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const rawSrc = showHeatmap ? (heatmapBase64 || heatmapUrl) : (faceBase64 || heatmapBase64 || heatmapUrl);
  const isDataUri = rawSrc?.startsWith("data:");
  const isUrl = rawSrc?.startsWith("http") || rawSrc?.startsWith("/uploads") || rawSrc?.startsWith("blob:");
  const imgSrc = rawSrc
    ? (isDataUri || isUrl
        ? rawSrc
        : `data:image/jpeg;base64,${rawSrc}`)
    : null;

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
          <button onClick={download} className="btn-ghost py-1.5 px-2.5">
            <Download size={14} />
          </button>
        </div>
      </div>

      {/* Image */}
      <div className={`relative rounded-lg overflow-hidden bg-surface-100 border border-surface-300 ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
           onClick={() => setZoomed(v => !v)}>
        <AnimatePresence mode="wait">
          {imgSrc ? (
            <motion.img
              key={showHeatmap ? "hm" : "orig"}
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
