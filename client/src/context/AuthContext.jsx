import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authService } from "../services/authService";
import api from "../services/api";

const AuthContext = createContext(null);

// WHY Context + localStorage over Redux?
// Auth state is simple: user object + loading flag.
// Redux adds boilerplate (actions, reducers, store) for no practical benefit here.
// Context re-renders only AuthProvider children — performance impact is minimal.
// localStorage persists the access token across page refreshes.
export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true); // true until we verify stored token

  useEffect(() => {
    const init = async () => {
      const token = localStorage.getItem("accessToken");
      if (!token) { setLoading(false); return; }
      try {
        api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
        const u = await authService.getMe();
        setUser(u);
      } catch {
        localStorage.removeItem("accessToken");
        delete api.defaults.headers.common["Authorization"];
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const login = useCallback(async (email, password) => {
    const { user: u, accessToken } = await authService.login(email, password);
    localStorage.setItem("accessToken", accessToken);
    api.defaults.headers.common["Authorization"] = `Bearer ${accessToken}`;
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (name, email, password) => {
    const { user: u, accessToken } = await authService.register(name, email, password);
    localStorage.setItem("accessToken", accessToken);
    api.defaults.headers.common["Authorization"] = `Bearer ${accessToken}`;
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try { await authService.logout(); } catch { /* ignore — clear locally anyway */ }
    localStorage.removeItem("accessToken");
    delete api.defaults.headers.common["Authorization"];
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
