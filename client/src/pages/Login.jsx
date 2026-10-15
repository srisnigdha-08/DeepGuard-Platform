import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Shield, AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [params]  = useSearchParams();
  const [form, setForm]       = useState({ email: "", password: "" });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const submit = async e => {
    e.preventDefault(); setError(null); setLoading(true);
    try {
      await login(form.email, form.password);
      toast.success("Welcome back!");
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Invalid email or password.");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-surface flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-surface-50 border-r border-surface-300 flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-500 flex items-center justify-center shadow-glow">
            <Shield size={18} className="text-white" />
          </div>
          <span className="text-base font-bold text-text-primary">DeepGuard</span>
        </div>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h1 className="text-3xl font-bold text-text-primary leading-tight">
            Detect deepfakes<br />before they spread.
          </h1>
          <p className="text-text-secondary mt-4 text-sm leading-relaxed">
            AI-powered analysis for images and videos.
            Grad-CAM explainability. Real-time results.
          </p>
          <div className="flex flex-wrap gap-2 mt-6">
            {["EfficientNet-B4","Grad-CAM","FF++ C23","<3s images","<15s video"].map(f => (
              <span key={f} className="px-3 py-1 rounded-full text-xs font-medium bg-primary-500/10 text-primary-400 border border-primary-500/20">{f}</span>
            ))}
          </div>
        </motion.div>
        <p className="text-2xs text-text-muted">0.8853 ROC-AUC on FaceForensics++ C23</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <h2 className="text-xl font-bold text-text-primary">Sign in</h2>
          <p className="text-sm text-text-secondary mt-1 mb-6">Enter your credentials to continue</p>

          {params.get("expired") && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-warning/5 border border-warning/20 text-warning text-xs">
              <AlertCircle size={13} /> Session expired. Please sign in again.
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-danger/5 border border-danger/20 text-danger text-xs">
              <AlertCircle size={13} /> {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input type="email" required placeholder="you@example.com" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input type={showPwd ? "text" : "password"} required placeholder="••••••••"
                  value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="input pr-10" />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
              {loading ? <><Loader2 size={15} className="animate-spin" />Signing in…</> : "Sign in"}
            </button>
          </form>
          <p className="text-center text-xs text-text-muted mt-5">
            Don't have an account?{" "}
            <Link to="/register" className="text-primary-400 hover:text-primary-300 font-medium">Create one</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
