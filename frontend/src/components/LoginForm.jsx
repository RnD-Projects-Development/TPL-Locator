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

        <div>
          <label className="auth-label">Email or Phone Number</label>
          <input
            className="auth-input"
            style={{ borderColor: identifierError ? "#ef4444" : undefined }}
            value={identifier}
            onChange={(e) => onIdentifierChange(e.target.value)}
            type="text"
            autoComplete="username"
            placeholder="Email or phone number"
            required
          />
          {identifierError && (
            <p className="auth-error">
              Enter a valid email or Pakistani number (03XXXXXXXXX or +92XXXXXXXXX)
            </p>
          )}
        </div>

        {isSignup && (
          <div>
            <label className="auth-label">Email Address</label>
            <input
              className="auth-input"
              style={{ borderColor: emailError ? "#ef4444" : undefined }}
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              readOnly={emailAutoFilled}
              required
            />
            {emailAutoFilled ? (
              <p className="auth-helper">
                Auto-filled from your email identifier
              </p>
            ) : (
              <p className="auth-helper">
                Required for phone signups — we&apos;ll send a verification code here
              </p>
            )}
            {emailError && (
              <p className="auth-error">Enter a valid email address</p>
            )}
          </div>
        )}

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label className="auth-label">Password</label>
            {isLogin && (
              <button
                type="button"
                onClick={() => switchMode(MODE.FORGOT)}
                className="auth-link auth-link-subtle"
              >
                Forgot password?
              </button>
            )}
          </div>
          <input
            className="auth-input"
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
