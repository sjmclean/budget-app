import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

interface HostedUser {
  id: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
}

const apiBaseUrl = (
  import.meta as ImportMeta & { env?: { VITE_BUDGET_API_URL?: string } }
).env?.VITE_BUDGET_API_URL?.replace(/\/+$/, "") ?? "";

export function UserManagementPage() {
  const [users, setUsers] = useState<HostedUser[]>([]);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    const status = await request<{
      user: { isAdmin: boolean } | null;
    }>("/api/auth/status");
    setAllowed(Boolean(status.user?.isAdmin));
    if (status.user?.isAdmin) {
      const result = await request<{ users: HostedUser[] }>("/api/auth/users");
      setUsers(result.users);
    }
  }

  useEffect(() => {
    void refresh().catch((error) => {
      setAllowed(false);
      setMessage(error instanceof Error ? error.message : "Unable to load users.");
    });
  }, []);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      const user = await request<HostedUser>("/api/auth/users", {
        method: "POST",
        body: JSON.stringify({
          email: values.get("email"),
          password: values.get("password"),
        }),
      });
      setUsers((current) =>
        [...current, user].sort((left, right) => left.email.localeCompare(right.email)),
      );
      form.reset();
      setMessage(`Created ${user.email}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create the user.");
    } finally {
      setBusy(false);
    }
  }

  if (allowed === null) {
    return <main className="page-content"><p>Loading users…</p></main>;
  }
  if (!allowed) {
    return (
      <main className="page-content">
        <h1>User management</h1>
        <Card><p>Administrator access is required.</p></Card>
      </main>
    );
  }

  return (
    <main className="page-content user-management-page">
      <header>
        <h1>User management</h1>
        <p className="muted">
          Create separate sign-in accounts. New users receive isolated browser
          storage and see only budgets assigned to them.
        </p>
      </header>

      <Card>
        <form className="user-create-form" onSubmit={createUser}>
          <h2>Create user</h2>
          <label>
            Email
            <input name="email" type="email" autoComplete="off" required />
          </label>
          <label>
            Initial password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
          <p className="muted">Use at least 12 characters.</p>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create user"}
          </Button>
          {message ? <p role="status">{message}</p> : null}
        </form>
      </Card>

      <Card>
        <h2>Active users</h2>
        <div className="user-list">
          {users.map((user) => (
            <div className="user-list-row" key={user.id}>
              <div>
                <strong>{user.email}</strong>
                <p className="muted">
                  Created {new Date(user.createdAt).toLocaleDateString()}
                </p>
              </div>
              <span>{user.isAdmin ? "Administrator" : "User"}</span>
            </div>
          ))}
        </div>
      </Card>
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
  const body = await response.json().catch(() => ({})) as {
    message?: string;
  };
  if (!response.ok) {
    throw new Error(body.message ?? `Request failed with HTTP ${response.status}.`);
  }
  return body as T;
}
