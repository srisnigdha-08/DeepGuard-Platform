import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Zap, Eye, FileText, BarChart3, Camera, ArrowRight, CheckCircle2 } from "lucide-react";

const FEATURES = [
  { icon: Shield,    title: "Multi-Modal Detection",   color: "text-primary-400", desc: "Image and video deepfake detection in one unified platform (Audio in development)." },
  { icon: Eye,       title: "Grad-CAM Explainability", color: "text-success",     desc: "Visual heatmaps show exactly which facial regions triggered detection." },
  { icon: Zap,       title: "Real-Time Analysis",      color: "text-warning",     desc: "<3s images, <15s videos. GPU-accelerated EfficientNet-B4." },
  { icon: Camera,    title: "Live Webcam Detection",   color: "text-accent-cyan", desc: "Real-time deepfake detection at 667ms per frame using MediaStream API." },
  { icon: FileText,  title: "PDF Forensic Reports",    color: "text-accent-purple",desc: "Generate court-admissible reports with heatmaps and confidence scores." },
  { icon: BarChart3, title: "Analytics Dashboard",     color: "text-primary-400", desc: "Full history, confidence trends, and detection statistics over time." },
];

const STATS = [
  { value: "0.8853", label: "AUC on FF++ C23",     sub: "EfficientNet-B4" },
  { value: "<3s",   label: "Image analysis",       sub: "GPU-accelerated" },
  { value: "<15s",  label: "Video analysis",       sub: "60-frame sampling" },
  { value: "2+",    label: "Modalities supported", sub: "Image · Video (Audio in dev)" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-surface">
      {/* Navbar */}
      <nav className="h-16 border-b border-surface-300 bg-surface-50/80 backdrop-blur-sm sticky top-0 z-50 flex items-center px-6 gap-4">
        <div className="flex items-center gap-2.5 flex-1">
          <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center shadow-glow">
            <Shield size={16} className="text-white" />
          </div>
          <span className="font-bold text-text-primary">DeepGuard</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login"    className="btn-ghost text-xs py-2 px-3">Sign in</Link>
          <Link to="/register" className="btn-primary text-xs py-2 px-4">Get started <ArrowRight size={13} /></Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden py-24 px-6">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-400 text-xs font-medium mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" />
              EfficientNet-B4 · 0.8853 ROC-AUC on FaceForensics++ C23
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-text-primary leading-tight mb-6">
              Detect DeepFakes<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-accent-purple">
                Before They Spread
              </span>
            </h1>
            <p className="text-lg text-text-secondary max-w-2xl mx-auto mb-8 leading-relaxed">
              AI-powered detection for images and videos with Grad-CAM explainability showing
              exactly where manipulation was detected. Open-source. Verified. Free.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link to="/register" className="btn-primary px-6 py-3 shadow-glow text-sm">
                Start detecting free <ArrowRight size={15} />
              </Link>
              <Link to="/login" className="btn-ghost px-6 py-3 border border-surface-300 text-sm">
                Sign in →
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 px-6 border-y border-surface-300 bg-surface-50">
        <div className="max-w-4xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-8">
          {STATS.map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="text-center">
              <p className="text-3xl font-bold text-primary-400 tabular-nums">{s.value}</p>
              <p className="text-sm font-medium text-text-primary mt-1">{s.label}</p>
              <p className="text-2xs text-text-muted mt-0.5">{s.sub}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-text-primary">Everything you need</h2>
            <p className="text-text-secondary mt-3">Professional deepfake detection in a single platform</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc, color }, i) => (
              <motion.div key={title}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                className="card p-5 hover:border-primary-500/30 transition-colors">
                <div className={`w-9 h-9 rounded-lg bg-surface-200 flex items-center justify-center mb-4 ${color}`}>
                  <Icon size={18} />
                </div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">{title}</h3>
                <p className="text-xs text-text-secondary leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-surface-50 border-t border-surface-300">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-text-primary mb-4">Ready to detect deepfakes?</h2>
          <p className="text-text-secondary mb-8">Free for research use. Deployed on Vercel + Render.</p>
          <Link to="/register" className="btn-primary px-8 py-3 shadow-glow inline-flex">
            Create free account <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-surface-300 py-8 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary-500/20 flex items-center justify-center">
              <Shield size={14} className="text-primary-400" />
            </div>
            <span className="text-sm font-semibold text-text-primary">DeepGuard</span>
          </div>
          <p className="text-xs text-text-muted">Final Year CS Project · PyTorch + MERN · EfficientNet-B4</p>
        </div>
      </footer>
    </div>
  );
}
