import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import { historyService } from "../services/historyService";

const CHART_STYLE = {
  contentStyle: {
    background: "#1a1d27", border: "1px solid #2d3348",
    borderRadius: "8px", fontSize: "12px", color: "#f1f5f9",
  },
};

export default function Analytics() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    historyService.getAnalytics()
      .then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-sm text-text-muted">Loading analytics…</p></div>;

  const o     = data?.overall || {};
  const trend = data?.weeklyTrend || [];
  const media = (data?.mediaBreakdown || []).map(m => ({ name: m.mediaType?.toUpperCase(), count: m.count }));
  const pieData = [{ name: "Real", value: o.realCount || 0 }, { name: "Fake", value: o.fakeCount || 0 }];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Analytics</h2>
        <p className="text-sm text-text-secondary mt-0.5">Insights from your detection history</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Analyses",  value: o.total || 0 },
          { label: "Fakes Detected",  value: o.fakeCount || 0 },
          { label: "Fake Rate",       value: `${o.total ? ((o.fakeCount / o.total) * 100).toFixed(1) : 0}%` },
          { label: "Avg Confidence",  value: `${o.avgConfidencePercent?.toFixed(1) ?? 0}%` },
        ].map(({ label, value }, i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }} className="card p-4 text-center">
            <p className="text-2xs text-text-muted uppercase tracking-wide mb-1">{label}</p>
            <p className="text-2xl font-bold text-text-primary tabular-nums">{value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Bar: daily detections */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Daily Detections (7 days)</h3>
          {trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3348" />
                <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} allowDecimals={false} />
                <Tooltip {...CHART_STYLE} />
                <Bar dataKey="count"     name="Total" fill="#6366f1" radius={[4,4,0,0]} />
                <Bar dataKey="fakeCount" name="Fake"  fill="#ef4444" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-48 flex items-center justify-center"><p className="text-sm text-text-muted">No data yet</p></div>}
        </div>

        {/* Pie: real vs fake */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Real vs Fake Distribution</h3>
          {o.total > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                     label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  <Cell fill="#22c55e" /><Cell fill="#ef4444" />
                </Pie>
                <Tooltip {...CHART_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="h-48 flex items-center justify-center"><p className="text-sm text-text-muted">No analyses yet</p></div>}
        </div>
      </div>

      {/* Line: fake rate trend */}
      {trend.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Fake Detection Rate Over Time</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart
              data={trend.map(d => ({ ...d, rate: d.count > 0 ? ((d.fakeCount / d.count) * 100).toFixed(1) : 0 }))}
              margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3348" />
              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} unit="%" domain={[0, 100]} />
              <Tooltip {...CHART_STYLE} formatter={v => [`${v}%`, "Fake Rate"]} />
              <Line type="monotone" dataKey="rate" stroke="#ef4444" strokeWidth={2}
                    dot={{ fill: "#ef4444", r: 3 }} name="Fake Rate" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Media breakdown */}
      {media.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Analyses by Media Type</h3>
          <div className="flex gap-4 flex-wrap">
            {media.map((m, i) => (
              <div key={m.name} className="flex-1 min-w-24 bg-surface-100 rounded-lg p-4 text-center border border-surface-300">
                <p className="text-xl font-bold tabular-nums" style={{ color: ["#6366f1","#22d3ee","#f59e0b"][i] }}>{m.count}</p>
                <p className="text-xs text-text-secondary mt-1">{m.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
