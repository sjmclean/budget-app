import type { HostedBudgetCatalogueEntry } from "../budget/budgetRegistry";

export interface AuthStatus {
  readonly needsSetup: boolean;
  readonly authenticated: boolean;
  readonly user: { readonly id: string; readonly email?: string; readonly isAdmin: boolean } | null;
  readonly budgets?: readonly HostedBudgetCatalogueEntry[];
}

const apiBaseUrl = (
  import.meta as ImportMeta & { env?: { VITE_BUDGET_API_URL?: string } }
).env?.VITE_BUDGET_API_URL?.replace(/\/+$/, "") ?? "";

let cachedStatus: AuthStatus | null = null;
let inFlight: Promise<AuthStatus> | null = null;

export function getCachedAuthStatus(): AuthStatus | null {
  return cachedStatus;
}

export async function loadAuthStatus(): Promise<AuthStatus> {
  if (cachedStatus) return cachedStatus;
  if (inFlight) return inFlight;

  inFlight = fetch(`${apiBaseUrl}/api/auth/status`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  }).then(async (response) => {
    const body = await response.json().catch(() => ({})) as AuthStatus & { message?: string };
    if (!response.ok) {
      throw new Error(body.message ?? `Request failed with HTTP ${response.status}.`);
    }
    cachedStatus = body;
    return body;
  }).finally(() => {
    inFlight = null;
  });

  return inFlight;
}
