import type {
  AppPersistenceGateway,
  PersistenceBackendKind,
} from "./appPersistenceGateway";

import { browserLocalStoragePersistenceGateway } from "./browserLocalStoragePersistenceGateway";

let configuredGateway: AppPersistenceGateway | null = null;

/**
 * Installs the active runtime persistence gateway for application consumers.
 *
 * Browser builds continue to default to localStorage. A future Tauri/desktop
 * bootstrap can compose a SQLite-capable gateway and configure it before React
 * renders, without requiring UI consumers to import concrete adapters directly.
 */
export function configureAppPersistenceGateway(gateway: AppPersistenceGateway): void {
  configuredGateway = gateway;
}

export function resetAppPersistenceGateway(): void {
  configuredGateway = null;
}

/**
 * Single selection point for active web persistence.
 *
 * Future desktop/Tauri work should configure a SQLite/Tauri implementation here.
 * The React app should consume this factory instead of importing concrete storage
 * services directly. That lets us migrate one feature area at a time without
 * pulling Node-only SQLite code into the browser bundle.
 */
export function getAppPersistenceGateway(
  backend?: PersistenceBackendKind,
  sqliteGateway?: AppPersistenceGateway,
): AppPersistenceGateway {
  if (!backend && configuredGateway) {
    return configuredGateway;
  }

  const selectedBackend = backend ?? "browser-local-storage";

  switch (selectedBackend) {
    case "browser-local-storage":
      return browserLocalStoragePersistenceGateway;

    case "sqlite-adapter":
      if (!sqliteGateway) {
        throw new Error(
          "SQLite gateway requested but no sqlite gateway instance was supplied.",
        );
      }

      return sqliteGateway;

    default:
      return browserLocalStoragePersistenceGateway;
  }
}