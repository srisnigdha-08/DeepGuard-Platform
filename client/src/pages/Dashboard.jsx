import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BarChart3, ShieldX, ShieldCheck, Upload,
  TrendingUp, ArrowRight, Clock, Activity,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import { historyService } from "../services/historyService";

const MetricCard = ({ icon: Icon, label, value, sub, colorClass, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
    className="card p-5"
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs text-text-muted uppercase tracking-wide">{label}</p>
        <p className="metric-value mt-1">{value ?? "—"}</p>
        {sub && <p className="text-xs text-text-muted mt-1">{sub}</p>}
      </div>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorClass}`}>
        <Icon size={16} />
      </div>
    </div>
  </motion.div>
);

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    background: "#1a1d27", border: "1px solid #2d3348",
    borderRadius: "8px", fontSize: "12px", color: "#f1f5f9",
  },
};

export default function Dashboard() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [recent,    setRecent]    = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    // WHY Promise.all? Parallel API calls — analytics + recent history
    // load simultaneously. Dashboard appears 2× faster than sequential calls.
    Promise.all([
      historyService.getAnalytics(),
      historyService.getHistory({ limit: 5 }),
    ])
      .then(([a, h]) => { setAnalytics(a); setRecent(h.results || []); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const o   = analytics?.overall || {};
  const trend = analytics?.weeklyTrend || [];
  const pieData = [
    { name: "Real", value: o.realCount || 0 },
    { name: "Fake", value: o.fakeCount || 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          Welcome back, {user?.name?.split(" ")[0]} 👋
        </h2>
        <p className="text-sm text-text-secondary mt-0.5">Your detection overview</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={BarChart3}   label="Total Analyses"  value={o.total || 0}       sub="All time"                                    colorClass="bg-primary-500/15 text-primary-400" delay={0}    />
        <MetricCard icon={ShieldX}     label="Fakes Detected"  value={o.fakeCount || 0}   sub={`${o.total ? ((o.fakeCount/o.total)*100).toFixed(0) : 0}% of total`} colorClass="bg-danger/10 text-danger"           delay={0.05} />
        <MetricCard icon={ShieldCheck} label="Verified Real"   value={o.realCount || 0}   sub="Authentic media"                             colorClass="bg-success/10 text-success"         delay={0.1}  />
        <MetricCard icon={Clock}       label="Avg Process Time" value={o.avgProcessingMs ? `${Math.round(o.avgProcessingMs)}ms` : "—"} sub="Per analysis" colorClass="bg-warning/10 text-warning"         delay={0.15} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 7-day trend */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Detection Activity</h3>
              <p className="text-2xs text-text-muted mt-0.5">Last 7 days</p>
            </div>
            <TrendingUp size={16} className="text-text-muted" />
          </div>
          {trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fakeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3348" />
                <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false}
                       tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} allowDecimals={false} />
                <Tooltip {...CHART_TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="count"     name="Total" stroke="#6366f1" strokeWidth={2} fill="url(#totalGrad)" />
                <Area type="monotone" dataKey="fakeCount" name="Fakes" stroke="#ef4444" strokeWidth={2} fill="url(#fakeGrad)"  />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-44 flex items-center justify-center">
              <p className="text-sm text-text-muted">No data yet. Upload your first file.</p>
            </div>
          )}
        </motion.div>

        {/* Pie chart */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
          className="card p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-1">Real vs Fake</h3>
          <p className="text-2xs text-text-muted mb-4">All-time distribution</p>
          {o.total > 0 ? (
            <div className="flex flex-col items-center">
              <PieChart width={140} height={140}>
                <Pie data={pieData} cx={70} cy={70} innerRadius={44} outerRadius={64}
                     paddingAngle={3} dataKey="value" strokeWidth={0}>
                  <Cell fill="#22c55e" /><Cell fill="#ef4444" />
                </Pie>
              </PieChart>
              <div className="w-full space-y-2 mt-2">
                {pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: i === 0 ? "#22c55e" : "#ef4444" }} />
                      <span className="text-xs text-text-secondary">{d.name}</span>
                    </div>
                    <span className="text-xs font-semibold text-text-primary">
                      {o.total ? ((d.value / o.total) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-44 flex items-center justify-center">
              <p className="text-sm text-text-muted">No analyses yet</p>
            </div>
          )}
        </motion.div>
      </div>

      {/* Recent analyses */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">Recent Analyses</h3>
          <Link to="/history" className="btn-ghost text-xs py-1.5 px-2.5">
            View all <ArrowRight size={12} />
          </Link>
        </div>
        {recent.length > 0 ? (
          <div className="space-y-1">
            {recent.map(item => (
              <Link key={item._id} to={`/result/${item._id}`}>
                <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-200 transition-colors border border-transparent hover:border-surface-300">
                  <div className={`w-1.5 h-9 rounded-full flex-shrink-0 ${item.isFake ? "bg-danger" : "bg-success"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{item.originalFilename}</p>
                    <p className="text-2xs text-text-muted mt-0.5">
                      {item.mediaType?.toUpperCase()} · {new Date(item.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={item.isFake ? "badge-fake" : "badge-real"}>{item.verdict}</span>
                    <p className="text-2xs text-text-muted mt-1">{item.confidencePercent?.toFixed(1)}%</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-10">
            <Upload size={24} className="text-text-muted mx-auto mb-2" />
            <p className="text-sm text-text-muted mb-3">No analyses yet</p>
            <Link to="/upload" className="btn-primary text-xs mx-auto w-fit">
              <Upload size={13} /> Analyze your first file
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
}
