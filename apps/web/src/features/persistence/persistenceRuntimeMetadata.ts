import type { PersistenceGatewayMetadata } from "./appPersistenceGateway";

const DEFAULT_BROWSER_PERSISTENCE_METADATA: PersistenceGatewayMetadata =
  Object.freeze({
    kind: "browser-local-storage",
    label: "Browser localStorage",
    description:
      "The web UI is currently using browser localStorage-backed feature services. This gateway preserves existing behaviour while SQLite-backed adapters are introduced incrementally.",
    isProductionPersistence: false,
  });

let configuredPersistenceMetadata: PersistenceGatewayMetadata =
  DEFAULT_BROWSER_PERSISTENCE_METADATA;

export function getConfiguredPersistenceMetadata(): PersistenceGatewayMetadata {
  return configuredPersistenceMetadata;
}

export function setConfiguredPersistenceMetadata(
  metadata: PersistenceGatewayMetadata,
): void {
  configuredPersistenceMetadata = metadata;
}

export function resetConfiguredPersistenceMetadata(): void {
  configuredPersistenceMetadata = DEFAULT_BROWSER_PERSISTENCE_METADATA;
}
