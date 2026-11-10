import { motion } from "framer-motion";
import { ShieldAlert, ShieldCheck, AlertTriangle, Clock, Cpu, Info, CheckCircle2 } from "lucide-react";
import ConfidenceGauge from "./ConfidenceGauge";
import { clsx } from "clsx";

export default function VerdictCard({ result }) {
  const {
    isFake, confidencePercent: conf = 0, verdict,
    mediaType = "media", modelVersion, processingTimings, regionCount = 0,
    rawFakeProbability, confidence,
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
            <h3 className="text-lg font-bold text-warning">Insufficient Evidence for Assessment</h3>
            <p className="text-sm font-semibold text-text-primary mt-1">
              {result.errorMessage || (result.faceDetected === false
                ? `No detectable human face was found in this ${mediaType}.`
                : `Insufficient facial frames detected in this ${mediaType} for a reliable sequence assessment.`)}
            </p>
            <p className="text-xs text-text-secondary mt-1">
              {mediaType === "video"
                ? "DeepGuard requires at least 3 distinct facial frames across the video to perform sequence analysis."
                : "DeepGuard is a face-focused deepfake detector. Please upload media with a clearly visible human face."}
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-200/80 border border-surface-300 text-2xs text-text-muted">
              <Info size={11} /> Automated AI assessment · Inconclusive without sufficient facial evidence
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  const rawScore = typeof rawFakeProbability === "number"
    ? rawFakeProbability
    : (typeof confidence === "number" ? confidence : (isFake ? conf / 100 : 1 - (conf / 100)));

  const title = isFake
    ? "Potential Manipulation Indicators Detected"
    : "No Strong Manipulation Indicators Detected";

  const explanation = isFake
    ? `This ${mediaType} displays feature patterns that deviate from authentic baselines. Automated AI assessment, not conclusive forensic proof.`
    : `This ${mediaType} displays no strong synthetic anomalies detectable by this model. Does not guarantee authenticity.`;

  const Icon = isFake ? ShieldAlert : ShieldCheck;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={clsx(
        "glass-card p-6 relative overflow-hidden",
        isFake
          ? "border-amber-500/30 shadow-[0_4px_24px_rgba(245,158,11,0.10)]"
          : "border-success/30 shadow-[0_4px_24px_rgba(34,197,94,0.10)]"
      )}
    >
      {/* Subtle gradient background */}
      <div className={clsx(
        "absolute inset-0 opacity-5 pointer-events-none bg-gradient-to-br",
        isFake ? "from-amber-500" : "from-success"
      )} />

      <div className="relative flex flex-col md:flex-row items-start gap-6">
        <div className="flex-shrink-0 self-center md:self-start">
          <ConfidenceGauge confidence={conf} isFake={isFake} size={110} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Icon size={22} className={isFake ? "text-amber-400" : "text-success"} />
            <span className={clsx("text-lg sm:text-xl font-bold", isFake ? "text-amber-400" : "text-success")}>
              {title}
            </span>
            <span className="text-2xs font-mono uppercase px-2 py-0.5 rounded bg-surface-200 text-text-muted border border-surface-300">
              Rule: {verdict} (θ=0.50)
            </span>
          </div>

          <p className="text-sm text-text-secondary mb-3 leading-relaxed">
            {explanation}
          </p>

          {/* Safety & Responsible AI transparency disclosure */}
          <div className="mb-3.5 p-2.5 rounded-lg bg-surface-100/90 border border-surface-300 flex items-start gap-2 text-2xs text-text-muted">
            <Info size={13} className="text-primary-400 flex-shrink-0 mt-0.5" />
            <p>
              <strong className="text-text-primary">Responsible AI Notice:</strong> Scores reflect automated statistical anomalies (EfficientNet-B4) and are not calibrated forensic certainties. False alarms may occur on compression artifacts or lighting variations. Consequential decisions require independent qualified review.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { icon: Cpu,           label: modelVersion || "EfficientNet-B4" },
              { icon: Clock,         label: `${processingTimings?.totalMs ?? "—"}ms` },
              { icon: CheckCircle2,  label: `Manipulation score P(Fake): ${rawScore.toFixed(2)} / 1.00` },
              regionCount > 0
                ? { icon: AlertTriangle, label: `${regionCount} region${regionCount > 1 ? "s" : ""} flagged`, danger: true }
                : null,
            ].filter(Boolean).map(({ icon: I, label, danger }) => (
              <span key={label} className={clsx(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-medium border",
                danger
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
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
