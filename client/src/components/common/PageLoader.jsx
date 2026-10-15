import { motion } from "framer-motion";
import { Cpu } from "lucide-react";

export default function PageLoader({ message = "Loading…" }) {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4"
      >
        <div className="relative">
          <div className="w-12 h-12 rounded-xl bg-primary-500/20 border border-primary-500/30 flex items-center justify-center">
            <Cpu size={22} className="text-primary-400" />
          </div>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            className="absolute -inset-1 rounded-xl border-2 border-transparent border-t-primary-500 border-r-primary-500/30"
          />
        </div>
        <p className="text-sm text-text-secondary">{message}</p>
      </motion.div>
    </div>
  );
}
