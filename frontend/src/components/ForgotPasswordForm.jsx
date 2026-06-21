import React, { useState } from "react";
import { useCityTag } from "../hooks/useCityTag.js";
import { isValidEmail, normalizeEmail } from "../utils/email.js";

const STEP = { REQUEST: "request", RESET: "reset", DONE: "done" };

export default function ForgotPasswordForm({ onBack }) {
  const { requestPasswordReset, resetPasswordWithOtp } = useCityTag();

  const [step, setStep] = useState(STEP.REQUEST);
  const [email, setEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const emailError = email && !isValidEmail(email);

  async function onRequestOtp(e) {
    e.preventDefault();
    setError("");
    setInfo("");

    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      setError("Enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await requestPasswordReset({ email: normalized });
      if (!res.reset_token) {
        setError("Unable to start password reset. Please try again.");
        return;
      }
      setResetToken(res.reset_token);
      setInfo(res.message || "Verification code sent. Check your email.");
      setStep(STEP.RESET);
    } catch (err) {
      setError(err.message || "Unable to send verification code");
    } finally {
      setLoading(false);
    }
  }

  async function onResetPassword(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!resetToken) {
      setError("Session expired. Please request a new verification code.");
      setStep(STEP.REQUEST);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await resetPasswordWithOtp({
        reset_token: resetToken,
        otp: otp.trim(),
        new_password: password,
      });
      setInfo(res.message || "Password updated successfully.");
      setStep(STEP.DONE);
    } catch (err) {
      setError(err.message || "Unable to reset password");
    } finally {
      setLoading(false);
    }
  }

  const backButton = (
    <button
      type="button"
      onClick={onBack}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: "none",
        border: "none",
        color: "rgba(255,255,255,0.5)",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 600,
        marginBottom: 16,
        padding: 0,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      Back to Login
    </button>
  );

  if (step === STEP.DONE) {
    return (
      <div>
        {backButton}
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-3">
          {info || "Password updated successfully. You can log in with your new password."}
        </div>
        <button
          type="button"
          onClick={onBack}
          className="w-full mt-4 rounded-lg bg-slate-900 text-white py-2.5 font-medium hover:bg-slate-800 transition"
        >
          Go to Login
        </button>
      </div>
    );
  }

  if (step === STEP.RESET) {
    const canSubmit =
      !loading &&
      resetToken &&
      otp.trim().length >= 4 &&
      password.length >= 6 &&
      confirmPassword &&
      password === confirmPassword;

    return (
      <div>
        {backButton}
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginBottom: 16 }}>
          Enter the 6-digit code sent to <strong style={{ color: "#fff" }}>{email}</strong>
        </p>
        <form onSubmit={onResetPassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white">Verification Code</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/10 bg-white text-slate-900 tracking-widest"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white">New Password</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/10 bg-white text-slate-900"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white">Confirm New Password</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/10 bg-white text-slate-900"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              required
            />
            {confirmPassword && password !== confirmPassword && (
              <p style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>Passwords do not match</p>
            )}
          </div>
          {info && (
            <div className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              {info}
            </div>
          )}
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-lg bg-slate-900 text-white py-2.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800 transition"
          >
            {loading ? "Updating..." : "Reset Password"}
          </button>
          <p style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
            Didn&apos;t get a code?{" "}
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setStep(STEP.REQUEST);
                setOtp("");
                setResetToken("");
                setError("");
                setInfo("");
              }}
              style={{
                background: "none",
                border: "none",
                color: "#cc4444",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 13,
                textDecoration: "underline",
                textUnderlineOffset: 2,
              }}
            >
              Resend
            </button>
          </p>
        </form>
      </div>
    );
  }

  const canRequest = !loading && email.trim() && isValidEmail(email);

  return (
    <div>
      {backButton}
      <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginBottom: 16 }}>
        Enter your account email and we&apos;ll send you a verification code.
      </p>
      <form onSubmit={onRequestOtp} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-white">Email Address</label>
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/10 bg-white text-slate-900"
            style={{ borderColor: emailError ? "#ef4444" : "#cbd5e1" }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
          {emailError && (
            <p style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>Enter a valid email address</p>
          )}
        </div>
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={!canRequest}
          className="w-full rounded-lg bg-slate-900 text-white py-2.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800 transition"
        >
          {loading ? "Sending..." : "Send Verification Code"}
        </button>
      </form>
    </div>
  );
}
