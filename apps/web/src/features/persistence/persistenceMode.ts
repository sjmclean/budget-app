import { getConfiguredPersistenceMetadata } from "./persistenceRuntimeMetadata";

export type PersistenceMode = "local-database";

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
 * central persistence boundary. The local database is the sole browser runtime;
 * pre-migration browser storage is available only through the one-way snapshot
 * reader used during first launch.
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