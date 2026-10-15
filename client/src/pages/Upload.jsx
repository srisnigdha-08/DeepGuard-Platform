import { useState, useCallback } from "react";
import { useNavigate }   from "react-router-dom";
import { useDropzone }   from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Upload as UpIcon, Image, Film, Music, X, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import { detectionService } from "../services/detectionService";

// Architecture: Each media type has its own pipeline stage labels and upload limits.
// WHY separate stages? Users need progress feedback on long operations.
// A single progress bar from 0-100% is uninformative for a 15s video analysis.
// Named stages communicate what the AI is doing — reduces perceived wait time.
const PIPELINE = {
  image: [
    { id: "upload",  label: "Uploading file",      pct: [0, 25] },
    { id: "face",    label: "Detecting face",       pct: [25, 45] },
    { id: "infer",   label: "GPU inference",        pct: [45, 80] },
    { id: "gradcam", label: "Grad-CAM heatmap",     pct: [80, 100] },
  ],
  video: [
    { id: "upload",  label: "Uploading file",       pct: [0, 20] },
    { id: "frames",  label: "Extracting frames",    pct: [20, 40] },
    { id: "infer",   label: "Batch GPU inference",  pct: [40, 80] },
    { id: "gcam",    label: "Generating heatmaps",  pct: [80, 100] },
  ],
  audio: [
    { id: "upload",  label: "Uploading file",       pct: [0, 30] },
    { id: "spec",    label: "Mel-spectrogram",      pct: [30, 60] },
    { id: "infer",   label: "Clone detection",      pct: [60, 100] },
  ],
};

const MAX_MB = { image: 20, video: 500 };
const ACCEPT  = {
  "image/*": [".jpg",".jpeg",".png",".webp"],
  "video/*": [".mp4",".avi",".mov"],
};

const getMediaType = file =>
  file.type.startsWith("image/") ? "image"
  : file.type.startsWith("video/") ? "video"
  : file.type.startsWith("audio/") ? "audio"
  : null;

const TYPE_ICONS = { image: Image, video: Film, audio: Music };

export default function Upload() {
  const navigate = useNavigate();
  const [file,     setFile]     = useState(null);
  const [status,   setStatus]   = useState("idle"); // idle | analyzing | done | error
  const [progress, setProgress] = useState(0);
  const [error,    setError]    = useState(null);

  const mediaType = file ? getMediaType(file) : null;
  const stages    = mediaType ? PIPELINE[mediaType] : [];
  const curStage  = stages.findLast?.(s => progress >= s.pct[0]) ?? stages[0];

  const onDrop = useCallback((accepted, rejected) => {
    if (rejected.length) {
      toast.error(rejected[0]?.errors?.[0]?.message || "File rejected");
      return;
    }
    if (!accepted.length) return;
    const f = accepted[0];
    const t = getMediaType(f);
    if (t === "audio") {
      toast.error("Audio detection is coming soon (model training in progress).");
      return;
    }
    if (!t) { toast.error("Unsupported file type"); return; }
    if (f.size > MAX_MB[t] * 1024 * 1024) {
      toast.error(`Max ${MAX_MB[t]}MB for ${t} files`); return;
    }
    setFile(f); setError(null); setStatus("idle"); setProgress(0);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: ACCEPT, maxFiles: 1, disabled: status === "analyzing",
  });

  const analyze = async () => {
    if (!file || !mediaType) return;
    setStatus("analyzing"); setError(null);

    // Animate upload stage while actual upload happens
    const uploadInterval = setInterval(() => {
      setProgress(p => p < 22 ? p + 2 : p);
    }, 80);

    try {
      const analyzers = {
        image: detectionService.analyzeImage,
        video: detectionService.analyzeVideo,
        audio: detectionService.analyzeAudio,
      };

      const result = await analyzers[mediaType](file, pct => {
        // Real upload progress maps to first stage
        const s = stages[0];
        setProgress(Math.round(s.pct[0] + (pct / 100) * (s.pct[1] - s.pct[0])));
      });

      clearInterval(uploadInterval);

      // Animate remaining stages
      for (const stage of stages.slice(1)) {
        await new Promise(r => setTimeout(r, 400));
        setProgress(stage.pct[1]);
      }

      setStatus("done");
      toast.success("Analysis complete!");
      setTimeout(() => navigate(`/result/${result._id}`), 500);
    } catch (err) {
      clearInterval(uploadInterval);
      const msg = err.response?.data?.message || "Analysis failed. Please try again.";
      setError(msg); setStatus("error"); setProgress(0);
      toast.error(msg);
    }
  };

  const TypeIcon = mediaType ? TYPE_ICONS[mediaType] : UpIcon;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Analyze Media</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          Upload an image, video, or audio file for deepfake detection
        </p>
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={clsx(
          "relative rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer select-none",
          isDragActive ? "border-primary-500 bg-primary-500/5 shadow-glow"
          : file        ? "border-surface-300 bg-surface-50"
          :               "border-surface-300 hover:border-primary-500/50 hover:bg-surface-50/50 bg-surface-50",
          status === "analyzing" && "pointer-events-none"
        )}
      >
        <input {...getInputProps()} />
        <div className="p-10 flex flex-col items-center text-center">
          {!file ? (
            <motion.div animate={isDragActive ? { scale: 1.05 } : { scale: 1 }}
              className="flex flex-col items-center gap-3">
              <div className={clsx(
                "w-16 h-16 rounded-2xl flex items-center justify-center transition-colors",
                isDragActive ? "bg-primary-500/20 text-primary-400" : "bg-surface-200 text-text-muted"
              )}>
                <UpIcon size={28} />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {isDragActive ? "Drop your file here" : "Drag & drop or click to upload"}
                </p>
                <p className="text-xs text-text-muted mt-1">Images · Videos · Audio (Coming Soon)</p>
              </div>
              <div className="flex gap-3 mt-1">
                {[
                  { icon: Image, label: "Images", sub: "JPG PNG WebP · 20MB" },
                  { icon: Film,  label: "Videos", sub: "MP4 AVI MOV · 500MB" },
                  { icon: Music, label: "Audio",  sub: "Coming Soon", opacity: "opacity-60" },
                ].map(({ icon: I, label, sub, opacity }) => (
                  <div key={label} className={clsx(
                    "flex flex-col items-center gap-1 px-4 py-2.5 bg-surface-100 rounded-lg border border-surface-300",
                    opacity
                  )}>
                    <I size={14} className="text-text-muted" />
                    <span className="text-2xs font-medium text-text-secondary">{label}</span>
                    <span className="text-2xs text-text-muted">{sub}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            <div className="w-full flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary-500/15 border border-primary-500/30 flex items-center justify-center text-primary-400 flex-shrink-0">
                <TypeIcon size={20} />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{file.name}</p>
                <p className="text-xs text-text-muted mt-0.5">
                  {mediaType?.toUpperCase()} · {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              {status !== "analyzing" && (
                <button onClick={e => { e.stopPropagation(); setFile(null); setStatus("idle"); setProgress(0); setError(null); }}
                  className="p-1.5 rounded-lg hover:bg-surface-200 text-text-muted hover:text-text-primary transition-colors flex-shrink-0">
                  <X size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-start gap-3 p-3 rounded-lg bg-danger/5 border border-danger/20 text-danger text-sm">
            <AlertCircle size={15} className="flex-shrink-0 mt-0.5" /> {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress pipeline */}
      <AnimatePresence>
        {status === "analyzing" && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} className="card p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-secondary">{curStage?.label}</span>
              <span className="text-xs font-mono text-primary-400">{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-surface-200 rounded-full overflow-hidden">
              <motion.div className="h-full bg-primary-500 rounded-full"
                initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
            </div>
            <div className="flex items-center gap-1 mt-3">
              {stages.map((s, i) => {
                const done   = progress >= s.pct[1];
                const active = curStage?.id === s.id;
                return (
                  <div key={s.id} className="flex items-center gap-1 flex-1">
                    <span className={clsx(
                      "flex items-center gap-1 text-2xs py-1 px-2 rounded truncate",
                      done ? "text-success bg-success/10" : active ? "text-primary-400 bg-primary-500/10" : "text-text-muted"
                    )}>
                      {done   ? <CheckCircle2 size={10} />
                      : active ? <Loader2 size={10} className="animate-spin" />
                      : <span className="w-2 h-2 rounded-full bg-surface-300 inline-block" />}
                      <span className="hidden sm:inline">{s.label}</span>
                    </span>
                    {i < stages.length - 1 && (
                      <div className={clsx("h-px flex-1", done ? "bg-success/40" : "bg-surface-300")} />
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CTA */}
      <button onClick={analyze}
        disabled={!file || status === "analyzing" || status === "done"}
        className="w-full btn-primary justify-center py-3 text-sm font-semibold">
        {status === "analyzing" ? <><Loader2 size={16} className="animate-spin" /> Analyzing…</>
        : status === "done"     ? <><CheckCircle2 size={16} /> Redirecting to results…</>
        :                         <><UpIcon size={16} /> Start Analysis</>}
      </button>
      <p className="text-2xs text-text-muted text-center">
        Files are deleted immediately after analysis · Results saved to your history
      </p>
    </div>
  );
}
