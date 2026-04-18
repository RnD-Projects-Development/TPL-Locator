// frontend/src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import "./styles.css";
import loadTPLMaps from "./components/loadTPLMaps.js";

// Kick off SDK download immediately on app start so it's ready
// before the user navigates to any map page
loadTPLMaps(() => {});

// StrictMode disabled — TPLMaps/Tangram WebGL cannot survive the intentional
// double-mount that StrictMode performs in dev. Re-enable only after migrating
// away from Tangram or wrapping it in a non-React singleton.
ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);

