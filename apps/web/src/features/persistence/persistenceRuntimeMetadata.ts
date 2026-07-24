import type { PersistenceProviderMetadata } from "./budgetPersistenceProvider";

const DEFAULT_LOCAL_DATABASE_METADATA: PersistenceProviderMetadata = Object.freeze({
  kind: "local-database",
  label: "Local database",
  description:
    "This device's local database is authoritative. Server connectivity is not required for reads or writes.",
  isProductionPersistence: true,
});

let configuredPersistenceMetadata: PersistenceProviderMetadata =
  DEFAULT_LOCAL_DATABASE_METADATA;

export function getConfiguredPersistenceMetadata(): PersistenceProviderMetadata {
  return configuredPersistenceMetadata;
}

export function setConfiguredPersistenceMetadata(
  metadata: PersistenceProviderMetadata,
): void {
  configuredPersistenceMetadata = metadata;
}

export function resetConfiguredPersistenceMetadata(): void {
  configuredPersistenceMetadata = DEFAULT_LOCAL_DATABASE_METADATA;
}
