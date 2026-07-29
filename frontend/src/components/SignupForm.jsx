import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCityTag } from "../hooks/useCityTag.js";
import { useAuth } from "../context/AuthContext.jsx";
import { isValidEmail, normalizeEmail } from "../utils/email.js";
import { isValidPakistaniPhone } from "../utils/userContact.js";

const inputCls = `
  mt-1 w-full rounded-lg px-3 py-2.5 text-sm
  bg-[#18181b] border border-[#3f3f46] text-white placeholder-zinc-500
  focus:outline-none focus:border-[#800000] focus:ring-1 focus:ring-[#800000]/40
  transition
`.replace(/\s+/g, " ").trim();

const labelCls = "block text-xs font-semibold text-zinc-400 uppercase tracking-widest";

export default function SignupForm() {
  const navigate = useNavigate();
  const { signup } = useCityTag();
  const { loginSuccess } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const passwordsMatch = !confirmPassword || password === confirmPassword;
  const emailError = email && !isValidEmail(email);
  const phoneError = phone && !isValidPakistaniPhone(phone);

  const canSubmit = useMemo(
    () =>
      phone.trim() &&
      isValidPakistaniPhone(phone) &&
      (!email.trim() || isValidEmail(email)) &&
      password.length >= 6 &&
      password === confirmPassword &&
      !loading,
    [email, phone, password, confirmPassword, loading]
  );

  async function onSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setLoading(true);
    try {
      const normalizedEmail = email.trim() ? normalizeEmail(email) : "";
      const res = await signup({
        phone: phone.trim(),
        password,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
      });
      const user = res.user ?? res.account;
      loginSuccess({
        user,
        accessToken: res.access_token,
        role: user?.role ?? "user",
      });
      localStorage.setItem(
        "citytag_last_login",
        JSON.stringify({ email: user?.email || phone.trim(), role: "user" })
      );
      navigate("/devices");
    } catch (err) {
      setError(err.message || "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <label className={labelCls}>Full Name</label>
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          type="text"
          placeholder="e.g. John Doe"
          autoComplete="name"
        />
      </div>

      <div>
        <label className={labelCls}>Email Address</label>
        <input
          className={inputCls}
          style={emailError ? { borderColor: "#ef4444" } : {}}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="you@example.com (optional)"
          autoComplete="email"
        />
        {emailError && (
          <p style={{ fontSize: 11, color: "#fca5a5", marginTop: 4 }}>
            Enter a valid email address
          </p>
        )}
      </div>

      <div>
        <label className={labelCls}>
          Phone Number <span style={{ color: "#ef4444" }}>*</span>
        </label>
        <input
          className={inputCls}
          style={phoneError ? { borderColor: "#ef4444" } : {}}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          placeholder="03XXXXXXXXX or +92XXXXXXXXX"
          autoComplete="tel"
          required
        />
        {phoneError && (
          <p style={{ fontSize: 11, color: "#fca5a5", marginTop: 4 }}>
            Enter a valid Pakistani number (03XXXXXXXXX or +92XXXXXXXXX)
          </p>
        )}
      </div>

      <div>
        <label className={labelCls}>
          Password <span style={{ color: "#ef4444" }}>*</span>
        </label>
        <input
          className={inputCls}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          minLength={6}
          required
        />
      </div>

      <div>
        <label className={labelCls}>
          Confirm Password <span style={{ color: "#ef4444" }}>*</span>
        </label>
        <input
          className={inputCls}
          style={!passwordsMatch ? { borderColor: "#ef4444" } : {}}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          required
        />
        {!passwordsMatch && (
          <p style={{ fontSize: 11, color: "#fca5a5", marginTop: 4 }}>
            Passwords do not match
          </p>
        )}
      </div>

      {error && (
        <div style={{
          padding: "8px 12px",
          background: "rgba(127,29,29,0.25)",
          border: "1px solid rgba(127,29,29,0.5)",
          borderRadius: 8,
          color: "#fca5a5",
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        style={{
          width: "100%",
          padding: "11px 0",
          borderRadius: 8,
          background: canSubmit ? "#800000" : "#3f3f46",
          color: canSubmit ? "#fff" : "#71717a",
          fontWeight: 700,
          fontSize: 14,
          letterSpacing: "0.04em",
          border: "none",
          cursor: canSubmit ? "pointer" : "not-allowed",
          transition: "background 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => { if (canSubmit) e.currentTarget.style.background = "#6b0000"; }}
        onMouseLeave={(e) => { if (canSubmit) e.currentTarget.style.background = "#800000"; }}
      >
        {loading ? "Creating account…" : "Sign up"}
      </button>

      <p style={{ textAlign: "center", fontSize: 13, color: "#a1a1aa" }}>
        Already have an account?{" "}
        <Link to="/login" style={{ color: "#ef4444", fontWeight: 600, textDecoration: "none" }}>
          Login
        </Link>
      </p>
    </form>
  );
}
