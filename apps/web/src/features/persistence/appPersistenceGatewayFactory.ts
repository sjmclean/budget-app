import type { AppPersistenceGateway } from "./appPersistenceGateway";
import { browserLocalStoragePersistenceGateway } from "./browserLocalStoragePersistenceGateway";

/**
 * Single selection point for active web persistence.
 *
 * Future desktop/Tauri work should add a SQLite/Tauri implementation here. The
 * React app should consume this factory instead of importing concrete storage
 * services directly. That lets us migrate one feature area at a time without
 * pulling Node-only SQLite code into the browser bundle.
 */
export function getAppPersistenceGateway(): AppPersistenceGateway {
  return browserLocalStoragePersistenceGateway;
}
