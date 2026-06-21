import type { AppPersistenceGateway } from "./appPersistenceGateway";
import { configureAppPersistenceGateway } from "./appPersistenceGatewayFactory";

declare global {
  interface Window {
    __BUDGET_APP_PERSISTENCE_GATEWAY__?: AppPersistenceGateway;
  }
}

/**
 * Runtime host integration point for desktop/Tauri persistence.
 *
 * Browser builds must not import SQLite repositories or native database drivers.
 * Instead, a host runtime can compose an AppPersistenceGateway and expose it on
 * window before React renders. If no host gateway is present, the app keeps the
 * browser-localStorage fallback selected by appPersistenceGatewayFactory.
 */
export function getHostPersistenceGateway(): AppPersistenceGateway | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.__BUDGET_APP_PERSISTENCE_GATEWAY__ ?? null;
}

export function bootstrapHostPersistenceGateway(): AppPersistenceGateway | null {
  const hostGateway = getHostPersistenceGateway();

  if (hostGateway) {
    configureAppPersistenceGateway(hostGateway);
  }

  return hostGateway;
}
