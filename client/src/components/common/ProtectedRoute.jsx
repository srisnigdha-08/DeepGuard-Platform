import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import PageLoader from "./PageLoader";

/**
 * WHY Outlet-based ProtectedRoute over per-page auth checks?
 * Single protection wrapper for ALL authenticated routes.
 * Add a new protected page? Just nest it inside <ProtectedRoute>.
 * No risk of forgetting to add auth check to new pages.
 * Supports role-based access (requireAdmin) via the same pattern.
 */
export default function ProtectedRoute({ requireAdmin = false }) {
  const { user, loading } = useAuth();
  if (loading)       return <PageLoader />;
  if (!user)         return <Navigate to="/login" replace />;
  if (requireAdmin && user.role !== "admin")
    return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
