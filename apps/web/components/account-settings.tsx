"use client";

import { useEffect, useState } from "react";
import { configuredAuthProviders } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { supabaseConfig } from "@/lib/supabase/config";

type Props = {
  user: { id: string; email: string | null } | null;
  workAuthorizationSync: boolean;
  onWorkAuthorizationSyncChange: (enabled: boolean) => Promise<void>;
  onSignOut: () => Promise<void>;
  onAccountDeleted: () => Promise<void>;
};

function appUrl(path: string) {
  return `${window.location.origin}${path}`;
}

export function AccountSettings({
  user,
  workAuthorizationSync,
  onWorkAuthorizationSyncChange,
  onSignOut,
  onAccountDeleted
}: Props) {
  const configured = Boolean(supabaseConfig());
  const providers = configuredAuthProviders();
  const [mode, setMode] = useState<"sign_in" | "sign_up" | "recovery">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState(false);
  const [passwordReset, setPasswordReset] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [accountDeletionEnabled, setAccountDeletionEnabled] = useState(false);

  useEffect(() => {
    setPasswordReset(new URLSearchParams(window.location.search).get("password_reset") === "1");
  }, []);

  useEffect(() => {
    if (!user) return;
    void fetch("/api/account/capabilities", { cache: "no-store" })
      .then((response) => response.json())
      .then((capabilities: { deletionEnabled?: boolean }) =>
        setAccountDeletionEnabled(capabilities.deletionEnabled === true)
      )
      .catch(() => setAccountDeletionEnabled(false));
  }, [user]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const supabase = createClient();
      if (mode === "sign_up") {
        if (!providers.emailDelivery)
          throw new Error("Email registration is unavailable until email delivery is configured.");
        const { error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: appUrl("/auth/callback?next=/") }
        });
        if (authError) throw authError;
        setMessage(
          "Check your email for a confirmation link. Your local workspace stays on this device until you choose to import it."
        );
        setVerificationPending(true);
      } else if (mode === "recovery") {
        if (!providers.emailDelivery)
          throw new Error("Password recovery is unavailable until email delivery is configured.");
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: appUrl("/auth/callback?next=/?password_reset=1")
        });
        if (authError) throw authError;
        setMessage("If an account exists for this email, a password reset link is on its way.");
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        window.location.assign("/");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not complete sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!providers.emailDelivery)
        throw new Error("Email confirmation is unavailable until email delivery is configured.");
      const { error: authError } = await createClient().auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: appUrl("/auth/callback?next=/") }
      });
      if (authError) throw authError;
      setMessage("If this account needs verification, a new link is on its way.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resend the confirmation link.");
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: "google" | "apple") {
    setBusy(true);
    setError("");
    try {
      const { error: authError } = await createClient().auth.signInWithOAuth({
        provider,
        options: { redirectTo: appUrl("/auth/callback?next=/") }
      });
      if (authError) throw authError;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${provider} sign in is unavailable.`);
      setBusy(false);
    }
  }

  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error: authError } = await createClient().auth.updateUser({ password: newPassword });
      if (authError) throw authError;
      setNewPassword("");
      setMessage("Password updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update your password.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await onSignOut();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign out.");
      setBusy(false);
    }
  }

  async function exportAccount() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/export", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not export account data. Try again.");
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "applypilot-account-export.json";
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not export account data.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete the account. Try again or contact support.");
      await onAccountDeleted();
      await createClient().auth.signOut({ scope: "local" });
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete the account.");
      setBusy(false);
    }
  }

  async function toggleWorkAuthorizationSync(enabled: boolean) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await onWorkAuthorizationSyncChange(enabled);
      setMessage(
        enabled
          ? "Work authorization answers will sync to this account."
          : "Work authorization answers were removed from this account."
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update cloud sync settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="account-settings">
      {!configured ? (
        <div className="panel">
          <h3>Cloud account</h3>
          <p className="muted">
            Sign-in and cloud sync are not configured for this deployment. Guest data stays in this browser.
          </p>
        </div>
      ) : user ? (
        <>
          <div className="panel account-panel">
            <div>
              <h3>Signed in</h3>
              <p className="muted">{user.email ?? "Account email unavailable"}</p>
              <p className="muted">
                Signing out clears the account workspace cache from this browser. Downloaded files and the
                separate browser extension package stay on this device.
              </p>
            </div>
            <button className="secondary" disabled={busy} onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
          <div className="panel">
            <h3>Privacy and cloud sync</h3>
            <p className="muted">
              Resume profiles, saved job links, and application status sync to your account. Original PDF and
              DOCX files, discovery results, and prepared answer packages stay on this device.
            </p>
            <label className="check sensitive-sync-choice">
              <input
                type="checkbox"
                checked={workAuthorizationSync}
                disabled={busy}
                onChange={(event) => void toggleWorkAuthorizationSync(event.target.checked)}
              />
              <span>
                Sync my work authorization answers, including visa type, dates, and sponsorship preferences.
              </span>
            </label>
            <div className="account-actions">
              <button className="secondary" disabled={busy} onClick={() => void exportAccount()}>
                Export cloud data
              </button>
              {passwordReset && (
                <form className="password-reset-form" onSubmit={(event) => void updatePassword(event)}>
                  <label className="field">
                    <span>New password</span>
                    <input
                      type="password"
                      minLength={8}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      required
                    />
                  </label>
                  <button disabled={busy || newPassword.length < 8}>Set new password</button>
                </form>
              )}
            </div>
          </div>
          <div className="panel danger-panel">
            <h3>Delete account and cloud data</h3>
            <p className="muted">
              This permanently deletes your account, resume profiles, saved jobs, applications, and any work
              authorization data you chose to sync. The account workspace cache is cleared from this browser
              too. Downloaded files and the separate browser extension package are not removed.
            </p>
            {accountDeletionEnabled && deleteConfirmation ? (
              <div className="account-actions">
                <button className="danger" disabled={busy} onClick={() => void deleteAccount()}>
                  Permanently delete account
                </button>
                <button className="secondary" disabled={busy} onClick={() => setDeleteConfirmation(false)}>
                  Cancel
                </button>
              </div>
            ) : accountDeletionEnabled ? (
              <button className="danger" disabled={busy} onClick={() => setDeleteConfirmation(true)}>
                Delete my account
              </button>
            ) : (
              <p className="provider-unavailable">
                Account deletion is unavailable until the server-only Supabase admin key is configured.
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="panel auth-panel">
          <h3>Back up your workspace</h3>
          <p className="muted">
            Keep using ApplyPilot as a guest. Sign in when you want to sync selected data across devices.
          </p>
          <div className="auth-providers">
            {providers.google ? (
              <button className="secondary" disabled={busy} onClick={() => void oauth("google")}>
                Continue with Google
              </button>
            ) : (
              <p className="provider-unavailable">Google sign-in is not configured for this deployment.</p>
            )}
            {providers.apple ? (
              <button className="secondary" disabled={busy} onClick={() => void oauth("apple")}>
                Continue with Apple
              </button>
            ) : (
              <p className="provider-unavailable">
                Apple sign-in is unavailable until Apple Developer and Supabase credentials are configured.
              </p>
            )}
          </div>
          {!providers.emailDelivery && (
            <p className="provider-unavailable">
              New email accounts and password recovery are unavailable until email delivery is configured.
              Existing email accounts can still sign in.
            </p>
          )}
          <div className="auth-divider">
            <span>or use email</span>
          </div>
          <div className="auth-mode-tabs" role="group" aria-label="Email account action">
            <button className={mode === "sign_in" ? "active" : ""} onClick={() => setMode("sign_in")}>
              Sign in
            </button>
            <button
              className={mode === "sign_up" ? "active" : ""}
              disabled={!providers.emailDelivery}
              onClick={() => setMode("sign_up")}
            >
              Create account
            </button>
          </div>
          <form onSubmit={(event) => void submit(event)}>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            {mode !== "recovery" && (
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  minLength={8}
                  autoComplete={mode === "sign_up" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
            )}
            <button disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "sign_up"
                  ? "Create account"
                  : mode === "recovery"
                    ? "Send reset link"
                    : "Sign in"}
            </button>
          </form>
          {verificationPending && mode === "sign_up" && (
            <button
              className="text-button"
              disabled={busy || !email}
              onClick={() => void resendVerification()}
            >
              Resend confirmation email
            </button>
          )}
          <button
            className="text-button"
            disabled={!providers.emailDelivery && mode !== "recovery"}
            onClick={() => setMode(mode === "recovery" ? "sign_in" : "recovery")}
          >
            {mode === "recovery" ? "Back to sign in" : "Forgot password?"}
          </button>
        </div>
      )}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="notice warning" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
