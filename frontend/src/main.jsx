// frontend/src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import "./styles.css";
import loadTPLMaps from "./components/loadTPLMaps.js";

loadTPLMaps(() => {});

// Reduce mouse-wheel scroll speed globally (skip Leaflet map containers)
document.addEventListener('wheel', (e) => {
  if (e.target.closest('.leaflet-container')) return
  let el = e.target
  while (el && el !== document.documentElement) {
    const { overflowY, overflow } = window.getComputedStyle(el)
    const isScrollable = (overflowY + overflow).match(/auto|scroll/)
    if (isScrollable && el.scrollHeight > el.clientHeight) {
      e.preventDefault()
      el.scrollBy({ top: e.deltaY * 0.45, left: e.deltaX * 0.45 })
      return
    }
    el = el.parentElement
  }
}, { passive: false })

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);