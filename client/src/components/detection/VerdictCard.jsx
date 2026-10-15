import { motion } from "framer-motion";
import { ShieldX, ShieldCheck, AlertTriangle, Clock, Cpu } from "lucide-react";
import ConfidenceGauge from "./ConfidenceGauge";
import { clsx } from "clsx";

export default function VerdictCard({ result }) {
  const {
    isFake, confidencePercent: conf = 0, verdict,
    mediaType, modelVersion, processingTimings, regionCount = 0,
  } = result;

  const isNoFace = result.faceDetected === false || verdict === "UNCERTAIN";

  if (isNoFace) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="glass-card p-6 border-warning/30 shadow-[0_4px_24px_rgba(234,179,8,0.12)] relative overflow-hidden"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-warning/10 border border-warning/20 flex items-center justify-center text-warning flex-shrink-0">
            <AlertTriangle size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-warning">Unable to analyze</h3>
            <p className="text-sm font-semibold text-text-primary mt-1">
              No detectable face was found in this image.
            </p>
            <p className="text-xs text-text-secondary mt-1">
              DeepGuard is a face-focused deepfake detector. Please upload an image with a clearly visible human face.
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  const color = isFake ? "danger" : "success";
  const Icon  = isFake ? ShieldX : ShieldCheck;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={clsx(
        "glass-card p-6 relative overflow-hidden",
        isFake
          ? "border-danger/30 shadow-[0_4px_24px_rgba(239,68,68,0.12)]"
          : "border-success/30 shadow-[0_4px_24px_rgba(34,197,94,0.12)]"
      )}
    >
      {/* Subtle gradient background */}
      <div className={clsx(
        "absolute inset-0 opacity-5 pointer-events-none bg-gradient-to-br",
        isFake ? "from-danger" : "from-success"
      )} />

      <div className="relative flex items-start gap-6">
        <ConfidenceGauge confidence={conf} isFake={isFake} size={110} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Icon size={20} className={isFake ? "text-danger" : "text-success"} />
            <span className={clsx("text-xl font-bold", isFake ? "text-danger" : "text-success")}>
              {verdict}
            </span>
          </div>

          <p className="text-sm text-text-secondary mb-4">
            {isFake
              ? `This ${mediaType} shows signs of AI manipulation.`
              : `This ${mediaType} appears to be authentic.`}
          </p>

          <div className="flex flex-wrap gap-2">
            {[
              { icon: Cpu,           label: modelVersion || "EfficientNet-B4" },
              { icon: Clock,         label: `${processingTimings?.totalMs ?? "—"}ms` },
              regionCount > 0
                ? { icon: AlertTriangle, label: `${regionCount} region${regionCount > 1 ? "s" : ""}`, danger: true }
                : null,
            ].filter(Boolean).map(({ icon: I, label, danger }) => (
              <span key={label} className={clsx(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-medium border",
                danger
                  ? "bg-danger/10 text-danger border-danger/20"
                  : "bg-surface-200 text-text-secondary border-surface-300"
              )}>
                <I size={10} />{label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
