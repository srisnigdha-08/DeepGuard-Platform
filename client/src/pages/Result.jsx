import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Download, Trash2, Clock, Cpu, Target, Film, Image, Music, Info, ShieldAlert } from "lucide-react";
import toast from "react-hot-toast";
import VerdictCard   from "../components/detection/VerdictCard";
import HeatmapViewer from "../components/detection/HeatmapViewer";
import FrameTimeline from "../components/detection/FrameTimeline";
import PageLoader    from "../components/common/PageLoader";
import { detectionService } from "../services/detectionService";
import { historyService }   from "../services/historyService";

const TYPE_ICONS = { image: Image, video: Film, audio: Music };

const StatCard = ({ icon: I, label, value, sub }) => (
  <div className="card p-4">
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-surface-200 flex items-center justify-center flex-shrink-0">
        <I size={14} className="text-text-secondary" />
      </div>
      <div className="min-w-0">
        <p className="text-2xs text-text-muted uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold text-text-primary mt-0.5 truncate">{value ?? "—"}</p>
        {sub && <p className="text-2xs text-text-muted mt-0.5">{sub}</p>}
      </div>
    </div>
  </div>
);

export default function Result() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    detectionService.getResult(id)
      .then(setResult)
      .catch(() => { toast.error("Result not found"); navigate("/history"); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <PageLoader message="Loading result…" />;
  if (!result) return null;

  const downloadReport = async () => {
    try {
      const blob = await historyService.generateReport(id);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `deepguard-report-${id}.pdf`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    } catch { toast.error("Could not generate report"); }
  };

  const deleteResult = async () => {
    if (!confirm("Delete this analysis record?")) return;
    try { await historyService.deleteResult(id); toast.success("Deleted"); navigate("/history"); }
    catch { toast.error("Could not delete"); }
  };

  const TypeIcon = TYPE_ICONS[result.mediaType] || Film;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/history" className="btn-ghost py-2 px-2.5"><ArrowLeft size={16} /></Link>
          <div>
            <h2 className="text-base font-semibold text-text-primary">Analysis Result</h2>
            <p className="text-xs text-text-muted font-mono">{id.slice(-12)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadReport} className="btn-ghost text-xs py-2">
            <Download size={14} /> PDF Report
          </button>
          <button onClick={deleteResult} className="btn-danger text-xs py-2">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Main verdict */}
      <VerdictCard result={result} />

      {/* Stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={TypeIcon} label="Media Type"   value={result.mediaType?.toUpperCase()} sub={result.originalFilename} />
        <StatCard icon={Target}   label={result.isFake ? "Suspicion Score" : "Conformity Score"} value={result.faceDetected === false || result.verdict === "UNCERTAIN" ? "N/A" : `${result.confidencePercent?.toFixed(1)}%`} sub={result.isFake ? "Uncalibrated fake score" : "Uncalibrated authentic score"} />
        <StatCard icon={Cpu}      label="Model"        value="EfficientNet-B4" sub={result.modelVersion} />
        <StatCard icon={Clock}    label="Total Time"   value={`${result.processingTimings?.totalMs ?? "—"}ms`}
                  sub={`Inference: ${result.processingTimings?.inferenceMs ?? "—"}ms`} />
      </div>

      {/* Image-specific */}
      {result.mediaType === "image" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {(result.heatmapBase64 || result.heatmapUrl || result.faceCropBase64) && (
            <HeatmapViewer
              faceBase64={result.faceCropBase64}
              heatmapBase64={result.heatmapBase64}
              heatmapUrl={result.heatmapUrl ? (result.heatmapUrl.startsWith("http") ? result.heatmapUrl : `http://localhost:5000${result.heatmapUrl}`) : null}
              regions={result.suspiciousRegions || []}
            />
          )}
          <div className="card p-4 space-y-4">
            <h3 className="text-sm font-semibold text-text-primary">Model Attribution Details</h3>
            {result.faceDetected !== false && result.verdict !== "UNCERTAIN" ? (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-text-secondary">Model manipulation score (uncalibrated)</span>
                  <span className="text-xs font-mono text-text-primary">
                    {(typeof result.rawFakeProbability === "number"
                      ? result.rawFakeProbability * 100
                      : (result.isFake ? result.confidencePercent : 100 - result.confidencePercent)
                    ).toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 bg-surface-200 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }}
                    animate={{
                      width: `${(typeof result.rawFakeProbability === "number"
                        ? result.rawFakeProbability * 100
                        : (result.isFake ? result.confidencePercent : 100 - result.confidencePercent)
                      )}%`
                    }}
                    transition={{ delay: 0.3, duration: 0.8 }}
                    className={`h-full rounded-full ${result.isFake ? "bg-amber-500" : "bg-success"}`} />
                </div>
              </div>
            ) : (
              <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg text-xs text-warning">
                {result.errorMessage || "Insufficient facial evidence was detected. Analysis could not be performed."}
              </div>
            )}
            {[
              { label: "Face detected",       value: result.faceDetected ? "Yes" : "No face detected",      color: result.faceDetected ? "text-success" : "text-warning" },
              { label: "Flagged regions",     value: `${result.regionCount || 0} detected`,                 color: result.regionCount > 0 ? "text-amber-400" : "text-success" },
              { label: "Decision threshold",  value: result.thresholdUsed ?? 0.5,                           color: "text-text-primary" },
              { label: "Analyzed at",         value: new Date(result.createdAt).toLocaleString(),            color: "text-text-muted" },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between py-2 border-t border-surface-300 first:border-0 text-xs">
                <span className="text-text-secondary">{label}</span>
                <span className={`font-medium ${color}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Video-specific */}
      {result.mediaType === "video" && (
        <div className="space-y-5">
          <FrameTimeline timeline={result.frameTimeline} peakTimestamp={result.peakTimestampSec} />
          {result.gradcamFrames?.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-text-primary mb-3">
                Frames with Highest Manipulation Scores ({result.gradcamFrames.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {result.gradcamFrames.map((f, i) => (
                  <div key={i} className="rounded-lg overflow-hidden border border-surface-300">
                    {f.heatmapBase64 ? (
                      <img src={f.heatmapBase64.startsWith("data:") ? f.heatmapBase64 : `data:image/jpeg;base64,${f.heatmapBase64}`}
                           alt={`Frame at ${f.timestampSec}s`} className="w-full object-cover" />
                    ) : (
                      <div className="h-32 flex items-center justify-center bg-surface-200 text-text-muted text-xs">No heatmap</div>
                    )}
                    <div className="p-2 bg-surface-100">
                      <p className="text-2xs text-text-muted">
                        @{f.timestampSec}s · score: <span className="text-amber-400 font-semibold">{f.fakeScore.toFixed(2)}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Audio-specific */}
      {result.mediaType === "audio" && (
        <div className="card p-4 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">Audio Clone Analysis</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Duration",   value: `${result.audioInfo?.durationSec?.toFixed(1) ?? "—"}s` },
              { label: "Segments",   value: result.audioInfo?.segmentsAnalyzed ?? "—" },
              { label: "Peak Score", value: `${((result.peakCloneScore ?? 0) * 100).toFixed(1)}%` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-surface-100 rounded-lg p-3 border border-surface-300 text-center">
                <p className="text-2xs text-text-muted">{label}</p>
                <p className="text-base font-bold text-text-primary mt-1">{value}</p>
              </div>
            ))}
          </div>
          {result.segmentScores?.length > 0 && (
            <>
              <p className="text-2xs text-text-muted">Clone confidence per segment</p>
              <div className="flex items-end gap-0.5 h-16">
                {result.segmentScores.map((s, i) => (
                  <div key={i} className="flex-1 rounded-t" style={{
                    height: `${s.score * 100}%`, minHeight: "2px", opacity: 0.85,
                    backgroundColor: s.score > 0.5 ? "#ef4444" : "#22c55e",
                  }} title={`${s.timestamp}s: ${(s.score * 100).toFixed(1)}%`} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Model Transparency & Reliability Guidance */}
      <div className="card p-5 border border-surface-300 space-y-3 bg-surface-50/50">
        <div className="flex items-center gap-2">
          <Info size={16} className="text-primary-400" />
          <h3 className="text-sm font-semibold text-text-primary">Model Transparency & Evaluation Caveats</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-text-secondary">
          <div className="space-y-1.5">
            <p className="font-medium text-text-primary">Limitations & Evaluated Benchmark Rates:</p>
            {result.mediaType === "video" ? (
              <p>
                In an internal confirmation evaluation of 50 authentic raw FaceForensics++ C23 videos, 29 produced false alarms (58.0% FPR) under the production quadratic-peak aggregation heuristic (A0). Compression noise or rapid head motion elevates model anomaly scores on authentic recordings.
              </p>
            ) : (
              <p>
                Model trained on FaceForensics++ C23 facial crops (80.2% validation specificity). Image compression artifacts, heavy motion blur, or unusual lighting can elevate anomaly scores on authentic photographs.
              </p>
            )}
            <p className="text-2xs text-text-muted">
              These figures reflect specific benchmark cohorts and do not represent universal real-world false alarm rates.
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="font-medium text-text-primary">Usage & Review Guidance:</p>
            <p>
              A low model score does not prove authenticity, nor does an elevated score establish digital forgery or malicious intent.
            </p>
            <p className="text-text-primary font-medium">
              Consequential decisions (legal, journalistic, or identity verification) must always undergo independent qualified expert review.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
