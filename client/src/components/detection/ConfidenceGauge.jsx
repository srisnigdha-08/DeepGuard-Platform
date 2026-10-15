import { motion } from "framer-motion";
import { clsx }   from "clsx";

/**
 * SVG circular gauge — animates from 0 to confidence % on mount.
 *
 * WHY SVG arc over CSS conic-gradient?
 * - SVG stroke-dashoffset animation is GPU-composited (no layout reflow)
 * - Supports rounded stroke caps (strokeLinecap="round")
 * - Precise control over radius/color/glow
 * - conic-gradient lacks cross-browser consistency for partial arcs
 */
export default function ConfidenceGauge({ confidence = 0, isFake = false, size = 120 }) {
  const r    = (size - 16) / 2;          // radius accounts for stroke width
  const circ = 2 * Math.PI * r;          // full circumference
  const fill = (confidence / 100) * circ; // filled portion
  const color = isFake ? "#ef4444" : "#22c55e";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0" style={{ transform: "rotate(-90deg)" }}>
        {/* Track */}
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#252a3a" strokeWidth={8} />
        {/* Fill — animated */}
        <motion.circle
          cx={size/2} cy={size/2} r={r}
          fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - fill }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
          style={{ filter: `drop-shadow(0 0 6px ${color}80)` }}
        />
      </svg>
      {/* Label */}
      <div className="flex flex-col items-center z-10">
        <motion.span
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8, type: "spring" }}
          className="text-xl font-bold tabular-nums"
          style={{ color }}
        >
          {Number(confidence).toFixed(1)}%
        </motion.span>
        <span className={clsx(
          "text-2xs font-bold uppercase tracking-widest mt-0.5",
          isFake ? "text-danger" : "text-success"
        )}>
          {isFake ? "FAKE" : "REAL"}
        </span>
      </div>
    </div>
  );
}
