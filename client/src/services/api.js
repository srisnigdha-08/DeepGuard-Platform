import axios from "axios";

// WHY a shared axios instance?
// All requests share the same baseURL, timeout, and interceptors.
// Token refresh logic lives here once — not duplicated in every service file.
const api = axios.create({
  baseURL:         import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  withCredentials: true,  // sends HTTP-only refresh cookie on every request
  timeout:         90_000, // 90s for video uploads
});

// Attach access token to every outgoing request
api.interceptors.request.use(config => {
  const token = localStorage.getItem("accessToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
}, err => Promise.reject(err));

// WHY token refresh interceptor?
// Access tokens expire in 15 min. Without this, every expired request
// would force the user to re-login. With the interceptor:
//   1. 401 TOKEN_EXPIRED detected
//   2. Silent refresh call (HTTP-only cookie) fetches new access token
//   3. Failed request retried automatically with new token
//   4. User never sees the expiry — seamless UX
let refreshing = false;
let queue = [];

const processQueue = (err, token = null) => {
  queue.forEach(p => err ? p.reject(err) : p.resolve(token));
  queue = [];
};

api.interceptors.response.use(r => r, async err => {
  const orig = err.config;
  const is401Expired = err.response?.status === 401
    && err.response?.data?.code === "TOKEN_EXPIRED"
    && !orig._retry;

  if (!is401Expired) return Promise.reject(err);

  if (refreshing) {
    return new Promise((resolve, reject) => queue.push({ resolve, reject }))
      .then(token => { orig.headers.Authorization = `Bearer ${token}`; return api(orig); });
  }

  orig._retry = true;
  refreshing  = true;

  try {
    const { data } = await axios.post(
      `${api.defaults.baseURL}/auth/refresh`, {},
      { withCredentials: true }
    );
    const newToken = data.data.accessToken;
    localStorage.setItem("accessToken", newToken);
    api.defaults.headers.common["Authorization"] = `Bearer ${newToken}`;
    processQueue(null, newToken);
    orig.headers.Authorization = `Bearer ${newToken}`;
    return api(orig);
  } catch (refreshErr) {
    processQueue(refreshErr, null);
    localStorage.removeItem("accessToken");
    window.location.href = "/login?expired=true";
    return Promise.reject(refreshErr);
  } finally {
    refreshing = false;
  }
});

export default api;
