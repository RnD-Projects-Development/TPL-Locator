import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCityTag } from "../hooks/useCityTag.js";
import { useAuth } from "../context/AuthContext.jsx";
import { isValidEmail, normalizeEmail } from "../utils/email.js";
import { isValidIdentifier, isValidPakistaniPhone } from "../utils/userContact.js";
import ForgotPasswordForm from "./ForgotPasswordForm.jsx";

const MODE = { LOGIN: "login", SIGNUP: "signup", FORGOT: "forgot" };
const LOGIN_METHOD = { PASSWORD: "password", OTP: "otp" };

export default function LoginForm() {
  const navigate = useNavigate();
  const { login, signup, requestSignupVerification, requestLoginOtp } = useCityTag();
  const { loginSuccess } = useAuth();

  const [mode, setMode] = useState(MODE.LOGIN);
  const [loginMethod, setLoginMethod] = useState(LOGIN_METHOD.PASSWORD);
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [loginToken, setLoginToken] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loginOtpSent, setLoginOtpSent] = useState(false);
  const [deliveryEmail, setDeliveryEmail] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const isSignup = mode === MODE.SIGNUP;
  const isLogin = mode === MODE.LOGIN;
  const isForgot = mode === MODE.FORGOT;
  const isPasswordLogin = isLogin && loginMethod === LOGIN_METHOD.PASSWORD;
  const isOtpLogin = isLogin && loginMethod === LOGIN_METHOD.OTP;

  const identifierError = identifier && !isValidIdentifier(identifier);
  const emailError = email && !isValidEmail(email);
  const phoneError = phone && !isValidPakistaniPhone(phone);

  const signupFormReady =
    name.trim() &&
    email.trim() &&
    isValidEmail(email) &&
    phone.trim() &&
    isValidPakistaniPhone(phone) &&
    password.length >= 6 &&
    confirmPassword &&
    password === confirmPassword;

  const canSendOtp = isSignup && signupFormReady && !sendingOtp && !loading;

  const canSendLoginOtp =
    isOtpLogin &&
    identifier.trim() &&
    isValidIdentifier(identifier) &&
    !sendingOtp &&
    !loading;

  const canSubmit = (() => {
    if (loading || sendingOtp) return false;
    if (isLogin) {
      if (!identifier.trim() || !isValidIdentifier(identifier)) return false;
      if (isPasswordLogin) return Boolean(password);
      return loginOtpSent && loginToken && otp.trim().length >= 4;
    }
    if (!signupFormReady) return false;
    return otpSent && verificationToken && otp.trim().length >= 4;
  })();

  function resetVerification() {
    setOtp("");
    setVerificationToken("");
    setOtpSent(false);
    setInfo("");
  }

  function resetLoginOtp() {
    setOtp("");
    setLoginToken("");
    setLoginOtpSent(false);
    setDeliveryEmail("");
    setInfo("");
  }

  function switchMode(newMode) {
    setMode(newMode);
    setError("");
    setInfo("");
    setConfirmPassword("");
    setEmail("");
    setPhone("");
    setLoginMethod(LOGIN_METHOD.PASSWORD);
    resetVerification();
    resetLoginOtp();
  }

  function switchLoginMethod(method) {
    setLoginMethod(method);
    setError("");
    setInfo("");
    setPassword("");
    resetLoginOtp();
  }

  async function onSendLoginOtp() {
    setError("");
    setInfo("");
    if (!canSendLoginOtp) return;

    setSendingOtp(true);
    try {
      const res = await requestLoginOtp({ identifier: identifier.trim() });
      if (!res.login_token) {
        setError("Unable to send login code. Please try again.");
        return;
      }
      setLoginToken(res.login_token);
      setLoginOtpSent(true);
      setDeliveryEmail(res.delivery_email || "");
      setInfo(res.message || "Login code sent. Check your email.");
    } catch (err) {
      setError(err.message || "Unable to send login code");
    } finally {
      setSendingOtp(false);
    }
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
        phone: phone.trim(),
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
          email: normalizedEmail,
          phone: phone.trim(),
          password,
          name: name.trim(),
          verification_token: verificationToken,
          otp: otp.trim(),
        });
        const res = await login({
          identifier: normalizedEmail,
          password,
        });
        loginSuccess({
          user: res.account ?? null,
          accessToken: res.access_token,
          role: res.account?.role ?? "user",
        });
        navigate("/devices");
      } else {
        const loginPayload = { identifier: identifier.trim() };
        if (isPasswordLogin) {
          loginPayload.password = password;
        } else {
          loginPayload.otp = otp.trim();
          loginPayload.login_token = loginToken;
        }
        const res = await login(loginPayload);
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
    return (
      <div key={mode} className="auth-fade-in" style={{ width: "100%" }}>
        <ForgotPasswordForm onBack={() => switchMode(MODE.LOGIN)} />
      </div>
    );
  }

  return (
    <div key={mode} className="auth-fade-in" style={{ width: isSignup ? "42em" : "26em", maxWidth: "100%", transition: "width 0.3s ease" }}>
      {isSignup && (
        <button
          type="button"
          onClick={() => switchMode(MODE.LOGIN)}
          className="auth-link auth-link-subtle"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4em",
            marginBottom: "1em",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to Login
        </button>
      )}

      <form onSubmit={onSubmit}>
        <div style={{
          display: "grid",
          gridTemplateColumns: isSignup ? "1fr 1fr" : "1fr",
          gap: "1em",
          alignItems: "start"
        }}>
        {isSignup && (
          <div>
            <label className="auth-label">Full Name</label>
            <input
              className="auth-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              type="text"
              placeholder="e.g. John Doe"
              autoComplete="name"
              required
            />
          </div>
        )}

        {isLogin && (
          <div>
            <label className="block text-sm font-medium text-white">Email or Phone Number</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/10 bg-white text-slate-900"
              style={{ borderColor: identifierError ? "#ef4444" : "#cbd5e1" }}
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                resetLoginOtp();
              }}
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
        )}

        {isLogin && (
          <div>
            <label className="block text-sm font-medium text-white mb-2">Sign in with</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => switchLoginMethod(LOGIN_METHOD.PASSWORD)}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: loginMethod === LOGIN_METHOD.PASSWORD ? "2px solid #cc4444" : "1px solid #cbd5e1",
                  background: loginMethod === LOGIN_METHOD.PASSWORD ? "rgba(204,68,68,0.15)" : "#fff",
                  color: loginMethod === LOGIN_METHOD.PASSWORD ? "#cc4444" : "#334155",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Password
              </button>
              <button
                type="button"
                onClick={() => switchLoginMethod(LOGIN_METHOD.OTP)}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: loginMethod === LOGIN_METHOD.OTP ? "2px solid #cc4444" : "1px solid #cbd5e1",
                  background: loginMethod === LOGIN_METHOD.OTP ? "rgba(204,68,68,0.15)" : "#fff",
                  color: loginMethod === LOGIN_METHOD.OTP ? "#cc4444" : "#334155",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                OTP
              </button>
            </div>
          </div>
        )}

        {isSignup && (
          <>
            <div>
              <label className="block text-sm font-medium text-white">Email Address</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/10 bg-white text-slate-900"
                style={{ borderColor: emailError ? "#ef4444" : "#cbd5e1" }}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  resetVerification();
                }}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 4 }}>
                We&apos;ll send a verification code to this email
              </p>
              {emailError && (
                <p className="auth-error">Enter a valid email address</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-white">Phone Number</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/10 bg-white text-slate-900"
                style={{ borderColor: phoneError ? "#ef4444" : "#cbd5e1" }}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  resetVerification();
                }}
                type="tel"
                autoComplete="tel"
                placeholder="03XXXXXXXXX or +92XXXXXXXXX"
                required
              />
              {phoneError && (
                <p style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>
                  Enter a valid Pakistani number (03XXXXXXXXX or +92XXXXXXXXX)
                </p>
              )}
            </div>
          </>
        )}

        {isPasswordLogin && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label className="auth-label">Password</label>
              <button
                type="button"
                onClick={() => switchMode(MODE.FORGOT)}
                className="auth-link auth-link-subtle"
              >
                Forgot password?
              </button>
            </div>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/10 bg-white text-slate-900"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
        )}

        {isSignup && (
          <div>
            <label className="block text-sm font-medium text-white">Password</label>
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
        )}

        {isSignup && (
          <div>
            <label className="auth-label">Confirm Password</label>
            <input
              className="auth-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              required
            />
            {confirmPassword && password !== confirmPassword && (
              <p className="auth-error">
                Passwords do not match
              </p>
            )}
          </div>
        )}

        {isOtpLogin && !loginOtpSent && (
          <button
            type="button"
            disabled={!canSendLoginOtp}
            onClick={onSendLoginOtp}
            className="w-full rounded-lg border border-slate-400 text-white py-2.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/10 transition"
          >
            {sendingOtp ? "Sending code..." : "Send login code"}
          </button>
        )}

        {isOtpLogin && loginOtpSent && (
          <div>
            <label className="block text-sm font-medium text-white">Login Code</label>
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
              Enter the code sent to{" "}
              <strong style={{ color: "#fff" }}>{deliveryEmail || "your email"}</strong>
            </p>
            <button
              type="button"
              disabled={sendingOtp}
              onClick={onSendLoginOtp}
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

        {isSignup && !otpSent && (
          <div style={{ gridColumn: isSignup ? "1 / -1" : undefined }}>
            <button
              type="button"
              disabled={!canSendOtp}
              onClick={onSendOtp}
              className="auth-btn-secondary"
            >
              {sendingOtp ? "Sending code..." : "Send verification code"}
            </button>
          </div>
        )}

        {isSignup && otpSent && (
          <div style={{ gridColumn: isSignup ? "1 / -1" : undefined }}>
            <label className="auth-label">Verification Code</label>
            <input
              className="auth-input"
              style={{ letterSpacing: "0.2em" }}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              required
            />
            <p className="auth-helper">
              Enter the code sent to <strong style={{ color: "#fff" }}>{normalizeEmail(email)}</strong>
            </p>
            <button
              type="button"
              disabled={sendingOtp}
              onClick={onSendOtp}
              className="auth-link"
              style={{ marginTop: "0.6em" }}
            >
              Resend code
            </button>
          </div>
        )}

        {info && (
          <div className="auth-helper" style={{ gridColumn: isSignup ? "1 / -1" : undefined, color: "#1d4ed8", background: "#eff6ff", border: "1px solid #bfdbfe", padding: "0.8em 1.2em", borderRadius: "0.5em" }}>
            {info}
          </div>
        )}

        {error && (
          <div className="auth-error" style={{ gridColumn: isSignup ? "1 / -1" : undefined, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", padding: "0.8em 1.2em", borderRadius: "0.5em" }}>
            {error}
          </div>
        )}

        <div style={{ gridColumn: isSignup ? "1 / -1" : undefined }}>
          <button
            type="submit"
            disabled={!canSubmit}
            className="auth-btn-primary"
          >
            {buttonLabel}
          </button>
        </div>
        </div>
      </form>

      <div className="auth-footer-text">
        {isLogin && (
          <p>
            Don&apos;t have an account?{" "}
            <button
              type="button"
              onClick={() => switchMode(MODE.SIGNUP)}
              className="auth-link"
            >
              Sign up
            </button>
          </p>
        )}
        {isSignup && (
          <p>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => switchMode(MODE.LOGIN)}
              className="auth-link"
            >
              Log in
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
