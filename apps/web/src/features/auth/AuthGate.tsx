import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";

interface AuthStatus {
  needsSetup: boolean;
  authenticated: boolean;
  user: { id: string; email: string; isAdmin: boolean } | null;
}

const apiBaseUrl = (
  import.meta as ImportMeta & { env?: { VITE_BUDGET_API_URL?: string } }
).env?.VITE_BUDGET_API_URL?.replace(/\/+$/, "") ?? "";

export function AuthGate({ children }: { readonly children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void request<AuthStatus>("/api/auth/status").then(setStatus).catch((cause) => {
      setError(cause instanceof Error ? cause.message : "Unable to contact the budget server.");
    });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = new FormData(event.currentTarget);
    try {
      await request(status?.needsSetup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: values.get("email"),
          password: values.get("password"),
        }),
      });
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    if (error) {
      return (
        <main className="auth-screen">
          <section className="auth-card" role="alert">
            <div>
              <p className="auth-eyebrow">Budget App</p>
              <h1>Unable to start the application</h1>
              <p className="muted">{error}</p>
            </div>
            <button
              className="button-primary"
              type="button"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </section>
        </main>
      );
    }

    return (
      <main
        className="route-loading-screen"
        role="status"
        aria-live="polite"
      >
        Loading application…
      </main>
    );
  }

  if (status.authenticated) return <>{children}</>;

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div>
          <p className="auth-eyebrow">Budget App</p>
          <h1>{status?.needsSetup ? "Create the administrator account" : "Sign in"}</h1>
          <p className="muted">
            {status?.needsSetup
              ? "This first account can create other users and adopt existing hosted budgets."
              : "Your account controls which hosted budgets you can open."}
          </p>
        </div>
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete={status?.needsSetup ? "new-password" : "current-password"}
            minLength={12}
            required
          />
        </label>
        {status?.needsSetup ? (
          <p className="muted">Use at least 12 characters.</p>
        ) : null}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="button-primary" type="submit" disabled={busy || !status}>
          {busy ? "Please wait…" : status?.needsSetup ? "Create account" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new Error(body.message ?? `Request failed with HTTP ${response.status}.`);
  return body as T;
}
