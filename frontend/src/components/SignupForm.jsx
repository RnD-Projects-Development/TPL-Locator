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
  const { signup, requestSignupVerification } = useCityTag();
  const { loginSuccess } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const passwordsMatch = !confirmPassword || password === confirmPassword;
  const emailError = email && !isValidEmail(email);
  const phoneError = phone && !isValidPakistaniPhone(phone);

  const formReadyForOtp = useMemo(
    () =>
      name.trim() &&
      email.trim() &&
      isValidEmail(email) &&
      phone.trim() &&
      isValidPakistaniPhone(phone) &&
      password.length >= 6 &&
      password === confirmPassword,
    [name, email, phone, password, confirmPassword]
  );

  const canSendOtp = formReadyForOtp && !sendingOtp && !loading;
  const canSubmit = useMemo(
    () =>
      formReadyForOtp &&
      otpSent &&
      verificationToken &&
      otp.trim().length >= 4 &&
      !loading &&
      !sendingOtp,
    [formReadyForOtp, otpSent, verificationToken, otp, loading, sendingOtp]
  );

  function resetVerification() {
    setOtp("");
    setVerificationToken("");
    setOtpSent(false);
    setInfo("");
  }

  async function onSendOtp() {
    setError("");
    setInfo("");
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = phone.trim();
    if (!formReadyForOtp || !isValidEmail(normalizedEmail)) return;

    setSendingOtp(true);
    try {
      const res = await requestSignupVerification({
        email: normalizedEmail,
        phone: normalizedPhone,
      });
      if (!res.verification_token) {
        setError("Unable to send verification code. Please try again.");
        return;
      }
      setVerificationToken(res.verification_token);
      setOtpSent(true);
      setInfo(res.message || "Verification code sent. Check your email.");
    } catch (err) {
      setError(err.message || "Unable to send verification code");
    } finally {
      setSendingOtp(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setLoading(true);
    try {
      const normalizedEmail = normalizeEmail(email);
      const res = await signup({
        email: normalizedEmail,
        phone: phone.trim(),
        password,
        name: name.trim(),
        verification_token: verificationToken,
        otp: otp.trim(),
      });
      const user = res.user ?? res.account;
      loginSuccess({
        user,
        accessToken: res.access_token,
        role: user?.role ?? "user",
      });
      localStorage.setItem(
        "citytag_last_login",
        JSON.stringify({ email: normalizedEmail, role: "user" })
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
        <label className={labelCls}>
          Full Name <span style={{ color: "#ef4444" }}>*</span>
        </label>
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          type="text"
          placeholder="e.g. John Doe"
          autoComplete="name"
          required
        />
      </div>

      <div>
        <label className={labelCls}>
          Email Address <span style={{ color: "#ef4444" }}>*</span>
        </label>
        <input
          className={inputCls}
          style={emailError ? { borderColor: "#ef4444" } : {}}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            resetVerification();
          }}
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <p style={{ fontSize: 11, color: "#a1a1aa", marginTop: 4 }}>
          We&apos;ll send a verification code to this email
        </p>
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
          onChange={(e) => {
            setPhone(e.target.value);
            resetVerification();
          }}
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

      {!otpSent ? (
        <button
          type="button"
          disabled={!canSendOtp}
          onClick={onSendOtp}
          style={{
            width: "100%",
            padding: "11px 0",
            borderRadius: 8,
            background: canSendOtp ? "#3f3f46" : "#27272a",
            color: canSendOtp ? "#fff" : "#71717a",
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: "0.04em",
            border: "1px solid #52525b",
            cursor: canSendOtp ? "pointer" : "not-allowed",
          }}
        >
          {sendingOtp ? "Sending code…" : "Send verification code"}
        </button>
      ) : (
        <div>
          <label className={labelCls}>
            Verification Code <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <input
            className={inputCls}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            required
          />
          <p style={{ fontSize: 11, color: "#a1a1aa", marginTop: 4 }}>
            Enter the 6-digit code sent to <strong style={{ color: "#e4e4e7" }}>{normalizeEmail(email)}</strong>
          </p>
          <button
            type="button"
            disabled={sendingOtp}
            onClick={onSendOtp}
            style={{
              marginTop: 8,
              background: "none",
              border: "none",
              color: "#ef4444",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              padding: 0,
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            Resend code
          </button>
        </div>
      )}

      {info && (
        <div style={{
          padding: "8px 12px",
          background: "rgba(30,58,95,0.35)",
          border: "1px solid rgba(59,130,246,0.4)",
          borderRadius: 8,
          color: "#93c5fd",
          fontSize: 13,
        }}>
          {info}
        </div>
      )}

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
