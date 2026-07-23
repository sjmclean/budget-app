import type {
  AppPersistenceGateway,
  PersistenceBackendKind,
} from "./appPersistenceGateway";
import {
  configureBudgetPersistenceProvider,
  getBudgetPersistenceProvider,
  resetBudgetPersistenceProvider,
} from "./budgetPersistenceProviderFactory";

/** @deprecated Prefer configureBudgetPersistenceProvider. */
export function configureAppPersistenceGateway(
  gateway: AppPersistenceGateway,
): void {
  configureBudgetPersistenceProvider(gateway);
}

/** @deprecated Prefer resetBudgetPersistenceProvider. */
export function resetAppPersistenceGateway(): void {
  resetBudgetPersistenceProvider();
}

/** @deprecated Prefer getBudgetPersistenceProvider. */
export function getAppPersistenceGateway(
  backend?: PersistenceBackendKind,
  sqliteGateway?: AppPersistenceGateway,
): AppPersistenceGateway {
  return getBudgetPersistenceProvider(backend, sqliteGateway);
}
