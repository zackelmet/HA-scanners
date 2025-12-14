"use client";

import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGoogle } from "@fortawesome/free-brands-svg-icons";
// Lazy-load react-hot-toast and Firebase auth at runtime to avoid DOM access during server prerender
import { useRouter } from "next/navigation";

enum FormMode {
  Login,
  Register,
}

export default function AuthForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formMode, setFormMode] = useState<FormMode>(FormMode.Login);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleGoogleAuth = async () => {
    try {
      const signInModule = await import("@/lib/firebase/signin");
      const { signIn, SignInMethod } = signInModule as any;
      const { user, error } = await signIn(SignInMethod.Google, {
        signupCallback: async (userCredential: any) => {
          // When a new user signs up, call the signup endpoint
          await fetch("/api/users/signup", {
            method: "POST",
            body: JSON.stringify({
              uid: userCredential.user.uid,
              email: userCredential.user.email,
              name: userCredential.user.displayName,
            }),
          });
        },
      });
      if (user) {
        router.push("/app/dashboard");
      } else if (error) {
        const { toast } = await import("react-hot-toast");
        toast.error(error);
      }
    } catch (err) {
      console.error("Google sign-in error:", err);
      const { toast } = await import("react-hot-toast");
      toast.error("An unexpected error occurred during Google sign-in");
    }
  };

  const handleLogin = async () => {
    try {
      const signInModule = await import("@/lib/firebase/signin");
      const { signIn, SignInMethod } = signInModule as any;
      const { user, error } = await signIn(SignInMethod.EmailPassword, {
        credentials: {
          email,
          password,
        },
        signupCallback: async (userCredential: any) => {
          // When a new user signs up, call the signup endpoint
          await fetch("/api/users/signup", {
            method: "POST",
            body: JSON.stringify({
              uid: userCredential.user.uid,
              email: userCredential.user.email,
              name: userCredential.user.displayName,
            }),
          });
        },
      });
      if (user) {
        router.push("/app/dashboard");
      } else if (error) {
        const { toast } = await import("react-hot-toast");
        toast.error(error);
      }
    } catch (err) {
      console.error("Login error:", err);
      const { toast } = await import("react-hot-toast");
      toast.error("An unexpected error occurred during login");
    }
  };

  const handleRegister = async () => {
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      const signUpModule = await import("@/lib/firebase/signup");
      const signUp = signUpModule.default as any;
      const { user, error } = await signUp(email, password);
      if (user) {
        router.push("/app/dashboard");
      } else if (error) {
        setError(error.message);
      }
    } catch (err) {
      console.error("Registration error:", err);
      setError("An unexpected error occurred during registration");
    }
  };

  const handleForgotPassword = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!email) {
      const { toast } = await import("react-hot-toast");
      toast.error("Please enter your email address.");
      return;
    }

    try {
      const authModule = await import("@/lib/firebase/firebaseClient");
      const firebaseAuth = (authModule as any).auth;
      const { sendPasswordResetEmail } = await import("firebase/auth");
      await sendPasswordResetEmail(firebaseAuth, email);
      const { toast } = await import("react-hot-toast");
      toast.success("Password reset email sent.");
    } catch (err) {
      console.error(err);
      const { toast } = await import("react-hot-toast");
      toast.error("An error occurred. Please try again.");
    }
  };

  return (
    <div className="relative min-h-screen bg-[var(--bg)] text-[--text] overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-60">
        <div className="absolute inset-6 neon-grid" />
      </div>

      <div className="relative w-full max-w-6xl mx-auto px-6 lg:px-12 py-12 lg:py-16">
        <div className="flex flex-col lg:flex-row gap-10 items-center">
          <div className="flex-1 space-y-4 text-center lg:text-left">
            <div className="inline-flex items-center gap-3 neon-badge-muted px-3 py-2 rounded-xl">
              Secure access
            </div>
            <h1 className="text-3xl lg:text-5xl font-black leading-tight">
              Start Scanning in 5 Minutes.
            </h1>
            <p className="text-base lg:text-lg neon-subtle max-w-xl">
              Join 3,500+ security teams who focus on fixing, not maintaining.
              No credit card required to begin.
            </p>
            <div className="flex flex-wrap gap-3 justify-center lg:justify-start text-sm text-[var(--text-muted)]">
              <span className="neon-chip">Hosted Nmap</span>
              <span className="neon-chip">Nikto findings</span>
              <span className="neon-chip">SOC2-ready controls</span>
            </div>
          </div>

          <div className="flex-1 w-full max-w-xl">
            <div className="neon-card p-6 lg:p-7 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1">
                    {formMode === FormMode.Login
                      ? "Welcome back"
                      : "Create account"}
                  </p>
                  <h2 className="text-2xl font-bold">
                    {formMode === FormMode.Login ? "Sign in" : "Sign up"}
                  </h2>
                </div>
                <button
                  className="text-sm neon-outline-btn px-3 py-2"
                  onClick={() =>
                    setFormMode(
                      formMode === FormMode.Login
                        ? FormMode.Register
                        : FormMode.Login,
                    )
                  }
                >
                  {formMode === FormMode.Login
                    ? "New here?"
                    : "Have an account?"}
                </button>
              </div>

              {error && (
                <div className="text-[var(--danger)] text-sm">{error}</div>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[var(--text)]">
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="you@company.com"
                    className="neon-input w-full py-3"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-[var(--text)]">
                    Password
                  </label>
                  <input
                    type="password"
                    placeholder="Enter password"
                    className="neon-input w-full py-3"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                {formMode === FormMode.Register && (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[var(--text)]">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      placeholder="Repeat password"
                      className="neon-input w-full py-3"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                )}

                {formMode === FormMode.Login && (
                  <div className="flex justify-end">
                    <button
                      className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] underline"
                      onClick={handleForgotPassword}
                    >
                      Forgot password?
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {formMode === FormMode.Login ? (
                  <button
                    disabled={!email || !password || error !== null}
                    onClick={handleLogin}
                    className="neon-primary-btn w-full py-3 font-semibold disabled:opacity-60"
                  >
                    Sign in
                  </button>
                ) : (
                  <button
                    disabled={!email || !password || !confirmPassword}
                    onClick={handleRegister}
                    className="neon-primary-btn w-full py-3 font-semibold disabled:opacity-60"
                  >
                    Create account
                  </button>
                )}

                <button
                  className="neon-outline-btn w-full py-3 font-semibold flex items-center justify-center gap-2"
                  onClick={handleGoogleAuth}
                >
                  <FontAwesomeIcon icon={faGoogle} className="text-lg" />{" "}
                  Continue with Google
                </button>
              </div>

              <div className="text-xs neon-subtle text-center">
                SSO coming soon. By continuing you agree to our Terms and
                Privacy.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
