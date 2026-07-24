import { getConfiguredPersistenceMetadata } from "./persistenceRuntimeMetadata";

export type PersistenceMode =
  | "local-database"
  | "browser-local-storage"
  | "sqlite-adapter";

export interface PersistenceModeSummary {
  mode: PersistenceMode;
  label: string;
  description: string;
  risk: "prototype" | "production-ready";
}

export const DEFAULT_PERSISTENCE_BACKEND: PersistenceMode =
  "local-database";

export function getDefaultPersistenceBackend(): PersistenceMode {
  return DEFAULT_PERSISTENCE_BACKEND;
}

/**
 * Current web persistence status.
 *
 * The React web app now uses the configured persistence provider through the
 * central persistence boundary. Local database mode is the default, while the
 * the legacy browser provider remains available temporarily for rollback during
 * the final migration window.
 */
export function getPersistenceModeSummary(): PersistenceModeSummary {
  const metadata = getConfiguredPersistenceMetadata();

  return {
    mode: metadata.kind,
    label: metadata.label,
    description: metadata.description,
    risk: metadata.isProductionPersistence
      ? "production-ready"
      : "prototype",
  };
}