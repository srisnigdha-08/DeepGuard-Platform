import { Bell, Menu } from "lucide-react";
import { useAuth }    from "../../context/AuthContext";
import { useLocation } from "react-router-dom";

const PAGE_TITLES = {
  "/dashboard": "Dashboard",
  "/upload":    "Analyze Media",
  "/webcam":    "Live Detection",
  "/history":   "Detection History",
  "/analytics": "Analytics",
  "/result":    "Analysis Result",
};

export default function Navbar({ onMenuClick }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const title = Object.entries(PAGE_TITLES)
    .find(([p]) => pathname.startsWith(p))?.[1] ?? "DeepGuard";

  return (
    <header className="h-16 bg-surface-50 border-b border-surface-300 flex items-center px-6 gap-4 flex-shrink-0">
      <button
        onClick={onMenuClick}
        className="p-2 -ml-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-200 transition-colors"
        aria-label="Toggle sidebar"
      >
        <Menu size={18} />
      </button>

      <div className="flex-1">
        <h1 className="text-base font-semibold text-text-primary">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <button className="relative p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-200 transition-colors">
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary-500" />
        </button>
        <div className="flex items-center gap-2 pl-2 border-l border-surface-300">
          <div className="w-7 h-7 rounded-full bg-primary-500/20 border border-primary-500/30 flex items-center justify-center">
            <span className="text-xs font-bold text-primary-400">
              {user?.name?.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="text-sm font-medium text-text-primary hidden sm:block">
            {user?.name?.split(" ")[0]}
          </span>
        </div>
      </div>
    </header>
  );
}
