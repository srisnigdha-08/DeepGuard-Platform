import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";

/**
 * Video frame-by-frame confidence timeline using Recharts AreaChart.
 *
 * WHY Recharts over D3 directly?
 * - Recharts wraps D3 in React-idiomatic components
 * - No manual SVG lifecycle management
 * - Responsive container handles resize automatically
 * - Sufficient for our use case; switch to raw D3 only for custom animations
 */
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const s = payload[0]?.value ?? 0;
  return (
    <div className="card p-2.5 text-xs shadow-lg">
      <p className="text-text-muted mb-1">{payload[0]?.payload?.time}s</p>
      <p className={`font-semibold ${s > 0.5 ? "text-amber-400" : "text-success"}`}>
        Score: {s.toFixed(2)} ({s > 0.5 ? "Elevated" : "Baseline"})
      </p>
    </div>
  );
};

export default function FrameTimeline({ timeline = [], peakTimestamp }) {
  if (!timeline.length) return null;
  const data = timeline.map(f => ({ time: f.timestamp?.toFixed(1), score: f.score }));

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Frame-by-Frame Model Scores</h3>
          <p className="text-2xs text-text-muted mt-0.5">
            {timeline.length} sampled frames · Peak score at {peakTimestamp?.toFixed(1) ?? "—"}s
          </p>
        </div>
        <div className="flex items-center gap-3 text-2xs text-text-muted">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block"/>Score &gt; 0.50</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success inline-block"/>Score &le; 0.50</span>
          <span className="flex items-center gap-1"><span className="w-5 border-t border-dashed border-primary-400 inline-block"/>Threshold 0.50</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d3348" />
          <XAxis dataKey="time" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} unit="s" />
          <YAxis domain={[0, 1]} tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false}
                 tickFormatter={v => `${Math.round(v * 100)}%`} />
          <Tooltip content={<CustomTooltip />} />
          {/* Decision threshold line */}
          <ReferenceLine y={0.5} stroke="#6366f1" strokeDasharray="4 4" strokeOpacity={0.8} />
          {/* Peak timestamp marker */}
          {peakTimestamp && (
            <ReferenceLine x={peakTimestamp.toFixed(1)} stroke="#ef4444"
                           strokeDasharray="3 3" strokeOpacity={0.6} />
          )}
          <Area type="monotone" dataKey="score" stroke="#ef4444" strokeWidth={2}
                fill="url(#scoreGrad)" dot={false}
                activeDot={{ r: 4, fill: "#ef4444" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
