import { NavLink, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Upload, History,
  BarChart3, Camera, LogOut, Cpu, Shield,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { clsx }   from "clsx";
import toast from "react-hot-toast";

const NAV_ITEMS = [
  { label: "Dashboard",      to: "/dashboard", icon: LayoutDashboard },
  { label: "Analyze Media",  to: "/upload",    icon: Upload },
  { label: "Live Detection", to: "/webcam",    icon: Camera },
  { label: "History",        to: "/history",   icon: History },
  { label: "Analytics",      to: "/analytics", icon: BarChart3 },
];

export default function Sidebar({ open }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    toast.success("Signed out");
    navigate("/login");
  };

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 240, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="flex-shrink-0 bg-surface-50 border-r border-surface-300 flex flex-col overflow-hidden"
        >
          {/* Logo */}
          <div className="h-16 flex items-center px-5 border-b border-surface-300 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center shadow-glow">
                <Shield size={16} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary leading-none">DeepGuard</p>
                <p className="text-2xs text-text-muted mt-0.5">AI Detection Platform</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            {NAV_ITEMS.map(({ label, to, icon: Icon }) => (
              <NavLink key={to} to={to}>
                {({ isActive }) => (
                  <motion.div
                    whileHover={{ x: 2 }}
                    className={clsx(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer",
                      isActive
                        ? "bg-primary-500/15 text-primary-400 border border-primary-500/20"
                        : "text-text-secondary hover:bg-surface-200 hover:text-text-primary"
                    )}
                  >
                    <Icon size={16} className={isActive ? "text-primary-400" : ""} />
                    {label}
                    {isActive && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-400" />
                    )}
                  </motion.div>
                )}
              </NavLink>
            ))}
          </nav>

          {/* User footer */}
          <div className="p-3 border-t border-surface-300 flex-shrink-0">
            <div className="flex items-center gap-3 px-2 py-2 mb-1 rounded-lg">
              <div className="w-8 h-8 rounded-full bg-primary-500/20 border border-primary-500/30 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-primary-400">
                  {user?.name?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{user?.name}</p>
                <p className="text-2xs text-text-muted truncate">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:text-danger hover:bg-danger/5 transition-colors"
            >
              <LogOut size={15} /> Sign Out
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
