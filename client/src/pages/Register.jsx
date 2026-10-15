import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Shield, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

const RULES = [
  { label: "At least 8 characters",      test: v => v.length >= 8 },
  { label: "One uppercase letter",        test: v => /[A-Z]/.test(v) },
  { label: "One lowercase letter",        test: v => /[a-z]/.test(v) },
  { label: "One number",                 test: v => /[0-9]/.test(v) },
  { label: "One special character (!@#…)", test: v => /[!@#$%^&*]/.test(v) },
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm]     = useState({ name: "", email: "", password: "" });
  const [show, setShow]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError] = useState(null);

  const allPass = RULES.every(r => r.test(form.password));

  const submit = async e => {
    e.preventDefault(); setError(null); setLoading(true);
    try {
      await register(form.name, form.email, form.password);
      toast.success("Account created!");
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed.");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-surface flex">
      <div className="hidden lg:flex lg:w-1/2 bg-surface-50 border-r border-surface-300 flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-500 flex items-center justify-center shadow-glow">
            <Shield size={18} className="text-white" />
          </div>
          <span className="text-base font-bold text-text-primary">DeepGuard</span>
        </div>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h1 className="text-3xl font-bold text-text-primary">Join the fight<br />against deepfakes.</h1>
          <p className="text-text-secondary mt-4 text-sm">Free to use. No credit card required.</p>
          <div className="mt-6 space-y-3">
            {["Unlimited image & video analysis","Grad-CAM explainability heatmaps","Full history + PDF reports","Real-time webcam detection"].map(f => (
              <div key={f} className="flex items-center gap-3">
                <CheckCircle2 size={15} className="text-success flex-shrink-0" />
                <span className="text-sm text-text-secondary">{f}</span>
              </div>
            ))}
          </div>
        </motion.div>
        <p className="text-2xs text-text-muted">0.8853 ROC-AUC on FaceForensics++ C23</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <h2 className="text-xl font-bold text-text-primary">Create account</h2>
          <p className="text-sm text-text-secondary mt-1 mb-6">Start detecting deepfakes today</p>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-danger/5 border border-danger/20 text-danger text-xs">
              <AlertCircle size={13} /> {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Full Name</label>
              <input type="text" required placeholder="Your name" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" required placeholder="you@example.com" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input type={show ? "text" : "password"} required placeholder="Create a strong password"
                  value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="input pr-10" />
                <button type="button" onClick={() => setShow(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {form.password && (
                <div className="mt-2 space-y-1">
                  {RULES.map(rule => (
                    <div key={rule.label} className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${rule.test(form.password) ? "bg-success" : "bg-surface-300"}`} />
                      <span className={`text-2xs ${rule.test(form.password) ? "text-success" : "text-text-muted"}`}>{rule.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button type="submit" disabled={loading || !allPass} className="btn-primary w-full justify-center py-2.5">
              {loading ? <><Loader2 size={15} className="animate-spin" />Creating…</> : "Create account"}
            </button>
          </form>

          <p className="text-center text-xs text-text-muted mt-5">
            Already have an account?{" "}
            <Link to="/login" className="text-primary-400 hover:text-primary-300 font-medium">Sign in</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
