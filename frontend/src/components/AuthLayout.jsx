import React from "react";
import ShapeGrid from "./ui/ShapeGrid.jsx";
import "./AuthLayout.css";
import tplLogo from "../assets/tpl.png";

export default function AuthLayout({ children }) {
  return (
    <div className="auth-wrapper">
      <div className="auth-background">
        <div className="auth-glow auth-glow-left" />
        <div className="auth-glow auth-glow-right" />
        <div className="auth-gradient-overlay" />
        <ShapeGrid
          direction="diagonal"
          speed={0.4}
          squareSize={40}
          shape="square"
          borderColor="rgba(255,255,255,0.10)"
          hoverFillColor="#666666"
          hoverFillColorSecondary="#666666"
          hoverTrailAmount={6}
        />
      </div>

      <div className="auth-content">
        <div className="auth-branding" data-aos="fade-down">
          <div className="auth-logo-box">
            <img src={tplLogo} alt="TPL Logo" className="auth-logo" />
          </div>
          <h1 className="auth-title">TPL Trakker</h1>
          <div className="auth-underline" />
        </div>

        <div className="auth-card" data-aos="zoom-in" data-aos-delay="200">
          <div className="auth-form-container">
            <p id="heading" className="auth-heading">Account</p>
            <div className="auth-form-content">{children}</div>
          </div>
        </div>

        <div className="auth-footer" data-aos="fade-up" data-aos-delay="400">
          <p>Secure Infrastructure • TPL Trakker</p>
        </div>
      </div>
    </div>
  );
}