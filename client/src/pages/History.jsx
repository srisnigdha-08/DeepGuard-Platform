import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Trash2, ExternalLink, ChevronLeft, ChevronRight, Film, Image, Music, Filter } from "lucide-react";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import { historyService } from "../services/historyService";

const TYPE_ICONS = { image: Image, video: Film, audio: Music };

export default function History() {
  const [results,    setResults]    = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [mediaType,  setMediaType]  = useState("");
  const [verdict,    setVerdict]    = useState("");
  const [page,       setPage]       = useState(1);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const d = await historyService.getHistory({
        page, limit: 10,
        ...(search    && { search }),
        ...(mediaType && { mediaType }),
        ...(verdict   && { verdict }),
      });
      setResults(d.results || []);
      setPagination(d.pagination || {});
    } catch { toast.error("Could not load history"); }
    finally { setLoading(false); }
  }, [page, search, mediaType, verdict]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);
  useEffect(() => { setPage(1); }, [search, mediaType, verdict]);

  const deleteItem = async id => {
    if (!confirm("Delete this analysis?")) return;
    try { await historyService.deleteResult(id); toast.success("Deleted"); fetchHistory(); }
    catch { toast.error("Could not delete"); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Detection History</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          {pagination.total ?? 0} total analyses · Automated assessments (human verification recommended)
        </p>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-48 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input type="text" placeholder="Search by filename…" value={search}
            onChange={e => setSearch(e.target.value)} className="input pl-8 text-sm" />
        </div>
        <select value={mediaType} onChange={e => setMediaType(e.target.value)} className="input w-auto text-sm">
          <option value="">All types</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
          <option value="audio">Audio</option>
        </select>
        <select value={verdict} onChange={e => setVerdict(e.target.value)} className="input w-auto text-sm">
          <option value="">All verdicts</option>
          <option value="FAKE">Fake</option>
          <option value="REAL">Real</option>
          <option value="UNCERTAIN">Uncertain</option>
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="hidden sm:grid grid-cols-[40px_1fr_120px_90px_100px_80px] items-center gap-4 px-5 py-3 bg-surface-100 border-b border-surface-300">
          {["Type","File","Classification","Model Score","Date","Actions"].map(h => (
            <span key={h} className="text-2xs text-text-muted uppercase tracking-wide">{h}</span>
          ))}
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-text-muted">Loading…</div>
        ) : results.length === 0 ? (
          <div className="py-16 text-center">
            <Filter size={24} className="text-text-muted mx-auto mb-2" />
            <p className="text-sm text-text-muted">No results match your filters</p>
          </div>
        ) : (
          results.map((item, i) => {
            const Icon = TYPE_ICONS[item.mediaType] || Film;
            return (
              <motion.div key={item._id}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                className="grid grid-cols-[40px_1fr_auto] sm:grid-cols-[40px_1fr_120px_90px_100px_80px] items-center gap-4 px-5 py-3.5 border-b border-surface-300 last:border-0 hover:bg-surface-100/60 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-surface-200 flex items-center justify-center text-text-muted">
                  <Icon size={14} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{item.originalFilename}</p>
                  <p className="text-2xs text-text-muted font-mono mt-0.5 hidden sm:block">{item._id.slice(-8)}</p>
                </div>
                <span className={item.verdict === "UNCERTAIN" ? "badge-uncertain" : (item.isFake ? "badge-fake" : "badge-real")}>
                  {item.verdict === "UNCERTAIN" ? "Inconclusive" : (item.isFake ? "Suspicious" : "Low Indicators")}
                </span>
                <p className="text-sm font-mono font-medium text-text-primary hidden sm:block">
                  {item.confidencePercent != null ? `${item.confidencePercent.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-text-muted whitespace-nowrap hidden sm:block">
                  {new Date(item.createdAt).toLocaleDateString()}
                </p>
                <div className="flex items-center gap-1">
                  <Link to={`/result/${item._id}`}
                    className="p-1.5 rounded hover:bg-surface-200 text-text-muted hover:text-primary-400 transition-colors" title="View">
                    <ExternalLink size={13} />
                  </Link>
                  <button onClick={() => deleteItem(item._id)}
                    className="p-1.5 rounded hover:bg-danger/10 text-text-muted hover:text-danger transition-colors" title="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted">
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} results
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={!pagination.hasPrev} className="btn-ghost py-1.5 px-2.5 disabled:opacity-40">
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-medium text-text-primary px-2">{page}</span>
            <button onClick={() => setPage(p => p + 1)}
              disabled={!pagination.hasNext} className="btn-ghost py-1.5 px-2.5 disabled:opacity-40">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
