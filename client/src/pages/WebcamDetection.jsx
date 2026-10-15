import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera, CameraOff, AlertTriangle,
  ShieldCheck, ShieldX, Loader2, Wifi, Activity,
} from "lucide-react";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import api from "../services/api";

const INTERVAL_MS  = 1500;  // ms between captures
const HISTORY_LEN  = 20;    // rolling confidence history length
const JPEG_QUALITY = 0.85;  // canvas JPEG compression

export default function WebcamDetection() {
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const intervalRef = useRef(null);
  const streamRef   = useRef(null);

  const [isActive,  setIsActive]  = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result,    setResult]    = useState(null);
  const [history,   setHistory]   = useState([]);
  const [frames,    setFrames]    = useState(0);
  const [avgLatency,setLatency]   = useState(0);
  const [error,     setError]     = useState(null);
  const [ready,     setReady]     = useState(false);

  // ── Start camera ──────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width:      { ideal: 640 },
          height:     { ideal: 480 },
          facingMode: "user",
          frameRate:  { ideal: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setReady(true);
          setIsActive(true);
        };
      }
    } catch (err) {
      const MSG = {
        NotAllowedError:  "Camera permission denied. Allow access in browser settings.",
        NotFoundError:    "No camera found. Connect a webcam.",
        NotReadableError: "Camera is used by another application.",
      };
      const msg = MSG[err.name] || `Camera error: ${err.message}`;
      setError(msg);
      toast.error(msg);
    }
  }, []);

  // ── Stop camera ───────────────────────────────────────────
  const stopCamera = useCallback(() => {
    clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsActive(false); setReady(false); setAnalyzing(false);
    setResult(null); setHistory([]); setFrames(0);
  }, []);

  // ── Capture one frame and analyse ─────────────────────────
  const captureAndAnalyse = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || analyzing) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    if (v.readyState < 2 || v.videoWidth === 0) return;

    // Draw current frame to off-screen canvas
    const ctx = c.getContext("2d");
    c.width  = v.videoWidth;
    c.height = v.videoHeight;
    ctx.drawImage(v, 0, 0, c.width, c.height);

    // Convert to JPEG blob — ~15KB per frame
    const blob = await new Promise(resolve =>
      c.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) return;

    setAnalyzing(true);
    const t0 = Date.now();

    try {
      const form = new FormData();
      form.append("file", blob, "webcam-frame.jpg");
      const { data } = await api.post("/detect/image", form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 10_000,
      });
      const r = data.data;
      setResult(r);
      setHistory(prev => [
        ...prev.slice(-(HISTORY_LEN - 1)),
        { time: Date.now(), confidence: r.confidence, isFake: r.isFake },
      ]);
      setFrames(n => n + 1);
      setLatency(prev => Math.round(prev * 0.8 + (Date.now() - t0) * 0.2));
    } catch {
      // Silent per-frame failure — avoids spamming the user
    } finally {
      setAnalyzing(false);
    }
  }, [analyzing]);

  // ── Capture loop ──────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    intervalRef.current = setInterval(captureAndAnalyse, INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [ready, captureAndAnalyse]);

  // ── Cleanup on unmount ────────────────────────────────────
  useEffect(() => () => stopCamera(), [stopCamera]);

  // ── Derived values ────────────────────────────────────────
  const isNoFace = result?.faceDetected === false || result?.verdict === "UNCERTAIN";
  const isFake   = result?.isFake ?? false;
  const conf     = result
    ? Math.round(result.confidencePercent ?? (isFake ? result.confidence * 100 : (1 - result.confidence) * 100))
    : 0;
  const recent   = history.slice(-5);
  const avgRecent = recent.length
    ? recent.reduce((s, r) => s + r.confidence, 0) / recent.length
    : 0;

  const borderColor = !isActive ? "border-surface-300"
    : isNoFace ? "border-warning/60 shadow-[0_0_20px_rgba(234,179,8,0.15)]"
    : isFake ? "border-danger/60 shadow-[0_0_20px_rgba(239,68,68,0.15)]"
    :           "border-success/60 shadow-[0_0_20px_rgba(34,197,94,0.15)]";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Real-Time Webcam Analysis</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          Frame captured every {INTERVAL_MS}ms · Results update live
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Video column (2/3) ── */}
        <div className="lg:col-span-2 space-y-3">
          {/* Video container */}
          <div className={clsx(
            "relative rounded-xl overflow-hidden bg-surface-100 border-2 transition-colors duration-300",
            borderColor
          )}>
            <video ref={videoRef} autoPlay playsInline muted
              className={clsx(
                "w-full aspect-video object-cover",
                "scale-x-[-1]",   // mirror for natural "selfie" view
                !isActive && "hidden"
              )}
            />

            {/* Idle state */}
            {!isActive && (
              <div className="aspect-video flex items-center justify-center">
                <div className="text-center">
                  <Camera size={40} className="text-text-muted mx-auto mb-3" />
                  <p className="text-sm text-text-secondary">Click "Start Camera" to begin</p>
                  <p className="text-2xs text-text-muted mt-1">Camera permission required</p>
                </div>
              </div>
            )}

            {/* Live overlays */}
            {isActive && (
              <>
                {/* LIVE badge */}
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 px-2.5 py-1 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-danger animate-pulse" />
                  <span className="text-xs font-semibold text-white">LIVE</span>
                </div>

                {/* Verdict badge */}
                {result && (
                  <motion.div key={isNoFace ? "nf" : isFake ? "f" : "r"}
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                    className={clsx(
                      "absolute top-3 right-3 px-3 py-1.5 rounded-full flex items-center gap-2 font-bold text-sm",
                      isNoFace ? "bg-warning text-black" : isFake ? "bg-danger text-white" : "bg-success text-white"
                    )}>
                    {isNoFace ? <><AlertTriangle size={14} /> NO FACE</> : isFake ? <><ShieldX size={14} /> FAKE</> : <><ShieldCheck size={14} /> REAL</>}
                  </motion.div>
                )}

                {/* Confidence bar */}
                {result && !isNoFace && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-4 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-2xs text-white/70">{isFake ? "Fake confidence" : "Real confidence"}</span>
                      <span className="text-xs font-bold"
                        style={{ color: isFake ? "#ef4444" : "#22c55e" }}>{conf}%</span>
                    </div>
                    <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                      <motion.div animate={{ width: `${conf}%` }} transition={{ duration: 0.3 }}
                        className="h-full rounded-full"
                        style={{ background: isFake ? `rgba(239,68,68,${0.7 + (result.confidence || 0) * 0.3})` : "rgba(34,197,94,0.8)" }} />
                    </div>
                  </div>
                )}

                {/* Analyzing spinner */}
                {analyzing && (
                  <div className="absolute bottom-12 right-3">
                    <Loader2 size={14} className="text-white/60 animate-spin" />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Hidden canvas for frame capture */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Controls */}
          <button
            onClick={isActive ? stopCamera : startCamera}
            className={isActive ? "w-full btn-danger justify-center" : "w-full btn-primary justify-center"}
          >
            {isActive
              ? <><CameraOff size={16} /> Stop Camera</>
              : <><Camera    size={16} /> Start Camera</>
            }
          </button>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-danger/5 border border-danger/20 text-danger text-sm">
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}
        </div>

        {/* ── Stats column (1/3) ── */}
        <div className="space-y-4">
          {/* Live statistics */}
          <div className="card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">Live Statistics</h3>
            {[
              { icon: Activity, label: "Frames analyzed",   value: frames.toString() },
              { icon: Wifi,     label: "Avg latency",       value: avgLatency > 0 ? `${avgLatency}ms` : "—" },
              { icon: Activity, label: "Capture interval",  value: `${INTERVAL_MS}ms` },
            ].map(({ icon: I, label, value }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-surface-300 last:border-0">
                <div className="flex items-center gap-2">
                  <I size={13} className="text-text-muted" />
                  <span className="text-xs text-text-secondary">{label}</span>
                </div>
                <span className="text-xs font-mono font-semibold text-text-primary">{value}</span>
              </div>
            ))}
          </div>

          {/* Confidence trend mini-chart */}
          {history.length > 0 && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-text-primary">Confidence Trend</h3>
                <span className={clsx(
                  "text-2xs font-bold px-2 py-0.5 rounded-full",
                  avgRecent > 0.5 ? "bg-danger/10 text-danger" : "bg-success/10 text-success"
                )}>
                  {avgRecent > 0.5 ? "TRENDING FAKE" : "TRENDING REAL"}
                </span>
              </div>
              {/* Bar mini-chart */}
              <div className="flex items-end gap-0.5 h-16">
                {history.map((r, i) => (
                  <div key={i} className="flex-1 rounded-t transition-all duration-300"
                    style={{
                      height: `${r.confidence * 100}%`,
                      minHeight: "2px",
                      background: r.isFake
                        ? `rgba(239,68,68,${0.4 + r.confidence * 0.6})`
                        : `rgba(34,197,94,${0.4 + (1 - r.confidence) * 0.6})`,
                    }}
                    title={`${Math.round(r.confidence * 100)}%`}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-2xs text-text-muted">Older</span>
                <span className="text-2xs text-text-muted">Latest</span>
              </div>
            </div>
          )}

          {/* Current frame details */}
          {result && (
            <div className={clsx("card p-4 border", isFake ? "border-danger/30" : "border-success/30")}>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Current Frame</h3>
              <div className="space-y-2">
                {[
                  { label: "Verdict",       value: result.verdict,                                color: isFake ? "text-danger" : "text-success" },
                  { label: "Confidence",    value: `${conf}%`,                                    color: "text-text-primary" },
                  { label: "Face detected", value: result.faceDetected ? "Yes" : "No",            color: result.faceDetected ? "text-success" : "text-warning" },
                  { label: "Regions",       value: `${result.regionCount || 0} suspicious`,       color: result.regionCount > 0 ? "text-danger" : "text-success" },
                  { label: "Inference",     value: `${result.processingTimings?.inferenceMs ?? "—"}ms`, color: "text-text-muted" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex justify-between items-center text-xs">
                    <span className="text-text-secondary">{label}</span>
                    <span className={`font-semibold ${color}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div className="text-2xs text-text-muted space-y-1 px-1">
            <p>• Frames are not stored permanently</p>
            <p>• Each frame counts toward your upload quota</p>
            <p>• Face camera directly with good lighting for best results</p>
          </div>
        </div>
      </div>
    </div>
  );
}
