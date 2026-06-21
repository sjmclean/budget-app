import { getAppPersistenceGateway } from "./appPersistenceGatewayFactory";

export type PersistenceMode =
  | "browser-local-storage"
  | "database-adapter-pending"
  | "sqlite-adapter";

export interface PersistenceModeSummary {
  mode: PersistenceMode;
  label: string;
  description: string;
  risk: "prototype" | "production-ready";
}

export const DEFAULT_PERSISTENCE_BACKEND: PersistenceMode =
  "browser-local-storage";

export function getDefaultPersistenceBackend(): PersistenceMode {
  return DEFAULT_PERSISTENCE_BACKEND;
}

/**
 * Current web persistence status.
 *
 * The package/backend layer contains SQLite repositories and application services,
 * but the React web app still writes budget data through browser localStorage
 * feature services. Keep this centralised so UI and future tests can expose the
 * distinction clearly while the DB-backed adapter is introduced incrementally.
 */
export function getPersistenceModeSummary(): PersistenceModeSummary {
  const gateway = getAppPersistenceGateway();

  return {
    mode: gateway.metadata.kind,
    label: gateway.metadata.label,
    description: gateway.metadata.description,
    risk: gateway.metadata.isProductionPersistence
      ? "production-ready"
      : "prototype",
  };
}