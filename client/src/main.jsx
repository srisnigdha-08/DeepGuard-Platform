import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import "./styles/index.css";

// Force dark mode on mount — our design system is dark-first
document.documentElement.classList.add("dark");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#1a1d27", color: "#f1f5f9",
              border: "1px solid #2d3348", borderRadius: "10px", fontSize: "14px",
            },
            success: { iconTheme: { primary: "#22c55e", secondary: "#0a1f0f" } },
            error:   { iconTheme: { primary: "#ef4444", secondary: "#1f0a0a" } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
