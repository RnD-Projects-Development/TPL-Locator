import React, { useEffect } from "react";
import { Navigate } from "react-router-dom";
import LoginForm from "../components/LoginForm.jsx";
import AuthLayout from "../components/AuthLayout.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import AOS from "aos";
import "aos/dist/aos.css";

export default function Login() {
  const { accessToken } = useAuth();

  useEffect(() => {
    AOS.init({
      duration: 1000,
      once: true,
      easing: "ease-out-back",
    });
  }, []);

  // Already logged in — redirect to dashboard
  if (accessToken) return <Navigate to="/devices" replace />;

  return (
    <AuthLayout>
      <LoginForm />
    </AuthLayout>
  );
}