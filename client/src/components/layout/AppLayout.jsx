import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Navbar  from "./Navbar";
import ErrorBoundary from "../common/ErrorBoundary";

/**
 * Shell layout wrapping all authenticated pages.
 * Sidebar + Navbar persist across route transitions — only <Outlet> re-renders.
 * WHY this over React.Suspense wrapping every page?
 * Shell stays stable. Page transitions feel instant (layout doesn't unmount/remount).
 */
export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar onMenuClick={() => setSidebarOpen(o => !o)} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
