import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCityTag } from "../hooks/useCityTag.js";
import { useAuth } from "../context/AuthContext.jsx";
import { isValidEmail, normalizeEmail } from "../utils/email.js";
import { isValidIdentifier } from "../utils/userContact.js";
import ForgotPasswordForm from "./ForgotPasswordForm.jsx";

const MODE = { LOGIN: "login", SIGNUP: "signup", FORGOT: "forgot" };

export default function LoginForm() {
  const navigate = useNavigate();
  const { login, signup, requestSignupVerification } = useCityTag();
  const { loginSuccess } = useAuth();

  const [mode, setMode] = useState(MODE.LOGIN);
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const isSignup = mode === MODE.SIGNUP;
  const isLogin = mode === MODE.LOGIN;
  const isForgot = mode === MODE.FORGOT;

  const identifierIsEmail = identifier.trim().includes("@");
  const emailAutoFilled = identifierIsEmail && isValidEmail(identifier);
  const identifierError = identifier && !isValidIdentifier(identifier);
  const emailError = email && !isValidEmail(email);

  useEffect(() => {
    if (isSignup && emailAutoFilled && !emailTouched) {
      setEmail(normalizeEmail(identifier));
    }
  }, [isSignup, identifier, emailAutoFilled, emailTouched]);

  const signupFormReady =
    name.trim() &&
    identifier.trim() &&
    isValidIdentifier(identifier) &&
    email.trim() &&
    isValidEmail(email) &&
    password.length >= 6 &&
    confirmPassword &&
    password === confirmPassword;

  const canSendOtp = isSignup && signupFormReady && !sendingOtp && !loading;

  const canSubmit = (() => {
    if (loading || sendingOtp) return false;
    if (!identifier.trim() || !password) return false;
    if (!isValidIdentifier(identifier)) return false;
    if (isLogin) return true;
    if (!signupFormReady) return false;
    return otpSent && verificationToken && otp.trim().length >= 4;
  })();

  function resetVerification() {
    setOtp("");
    setVerificationToken("");
    setOtpSent(false);
    setInfo("");
  }

  function switchMode(newMode) {
    setMode(newMode);
    setError("");
    setInfo("");
    setConfirmPassword("");
    setEmail("");
    setEmailTouched(false);
    resetVerification();
  }

  function onIdentifierChange(value) {
    setIdentifier(value);
    resetVerification();
    if (!value.trim().includes("@")) {
      setEmailTouched(false);
    }
  }

  function onEmailChange(value) {
    setEmail(value);
    setEmailTouched(true);
    resetVerification();
  }

  async function onSendOtp() {
    setError("");
    setInfo("");
    const normalizedEmail = normalizeEmail(email);
    if (!canSendOtp || !isValidEmail(normalizedEmail)) return;

    setSendingOtp(true);
    try {
      const res = await requestSignupVerification({
        email: normalizedEmail,
        identifier: identifier.trim(),
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
    setError("");
    setLoading(true);
    try {
      if (isSignup) {
        const normalizedEmail = normalizeEmail(email);
        await signup({
          identifier: identifier.trim(),
          email: normalizedEmail,
          password,
          name: name.trim(),
          verification_token: verificationToken,
          otp: otp.trim(),
        });
        const res = await login({
          identifier: identifier.trim(),
          password,
        });
        loginSuccess({
          user: res.account ?? null,
          accessToken: res.access_token,
          role: res.account?.role ?? "user",
        });
        navigate("/devices");
      } else {
        const res = await login({
          identifier: identifier.trim(),
          password,
        });
        loginSuccess({
          user: res.account ?? null,
          accessToken: res.access_token,
          role: res.account?.role ?? "user",
        });
        navigate("/Homepage");
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const buttonLabel = isSignup
    ? loading ? "Creating Account..." : "Sign Up"
    : loading ? "Logging in..." : "Login";

  if (isForgot) {
    return <ForgotPasswordForm onBack={() => switchMode(MODE.LOGIN)} />;
  }

  return (
    <div>
      {isSignup && (
        <button
          type="button"
          onClick={() => switchMode(MODE.LOGIN)}
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
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        {isSignup && (
          <div>
            <label className="block text-sm font-medium text-white">Full Name</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/10 bg-white text-slate-900"
              value={name}
              onChange={(e) => setName(e.target.value)}
              type="text"
              placeholder="e.g. John Doe"
              autoComplete="name"
              required
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-white">Email or Phone Number</label>
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/10 bg-white text-slate-900"
            style={{ borderColor: identifierError ? "#ef4444" : "#cbd5e1" }}
            value={identifier}
            onChange={(e) => onIdentifierChange(e.target.value)}
            type="text"
            autoComplete="username"
            placeholder="Email or phone number"
            required
          />
          {identifierError && (
            <p style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>
              Enter a valid email or Pakistani number (03XXXXXXXXX or +92XXXXXXXXX)
            </p>
          )}
        </div>

        {isSignup && (
          <div>
            <label className="block text-sm font-medium text-white">Email Address</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/10 bg-white text-slate-900"
              style={{ borderColor: emailError ? "#ef4444" : "#cbd5e1" }}
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              readOnly={emailAutoFilled}
              required
            />
            {emailAutoFilled ? (
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 4 }}>
                Auto-filled from your email identifier
              </p>
            ) : (
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 4 }}>
                Required for phone signups — we&apos;ll send a verification code here
              </p>
            )}
            {emailError && (
              <p style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>Enter a valid email address</p>
            )}
          </div>
        )}

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label className="block text-sm font-medium text-white">Password</label>
            {isLogin && (
              <button
                type="button"
                onClick={() => switchMode(MODE.FORGOT)}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.55)",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: 0,
                  textDecoration: "underline",
                  textUnderlineOffset: 2,
                }}
              >
                Forgot password?
              </button>
            )}
          </div>
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/10 bg-white text-slate-900"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            minLength={isSignup ? 6 : undefined}
            required
          />
        </div>

        {isSignup && (
          <div>
            <label className="block text-sm font-medium text-white">Confirm Password</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/10 bg-white text-slate-900"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              required
            />
            {confirmPassword && password !== confirmPassword && (
              <p style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>
                Passwords do not match
              </p>
            )}
          </div>
        )}

        {isSignup && !otpSent && (
          <button
            type="button"
            disabled={!canSendOtp}
            onClick={onSendOtp}
            className="w-full rounded-lg border border-slate-400 text-white py-2.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/10 transition"
          >
            {sendingOtp ? "Sending code..." : "Send verification code"}
          </button>
        )}

        {isSignup && otpSent && (
          <div>
            <label className="block text-sm font-medium text-white">Verification Code</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 tracking-widest focus:outline-none focus:ring-2 focus:ring-slate-900/10 bg-white text-slate-900"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              required
            />
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 4 }}>
              Enter the code sent to <strong style={{ color: "#fff" }}>{normalizeEmail(email)}</strong>
            </p>
            <button
              type="button"
              disabled={sendingOtp}
              onClick={onSendOtp}
              style={{
                marginTop: 8,
                background: "none",
                border: "none",
                color: "#cc4444",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 12,
                textDecoration: "underline",
                textUnderlineOffset: 2,
              }}
            >
              Resend code
            </button>
          </div>
        )}

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
          {buttonLabel}
        </button>
      </form>

      <div style={{ marginTop: 16, textAlign: "center" }}>
        {isLogin && (
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
            Don&apos;t have an account?{" "}
            <button
              type="button"
              onClick={() => switchMode(MODE.SIGNUP)}
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
              Sign up
            </button>
          </p>
        )}
        {isSignup && (
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => switchMode(MODE.LOGIN)}
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
              Log in
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
