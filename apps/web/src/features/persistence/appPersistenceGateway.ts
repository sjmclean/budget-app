import type {
  BudgetPersistenceProvider,
  PersistenceProviderMetadata,
} from "./budgetPersistenceProvider";

export type { PersistenceBackendKind } from "./budgetPersistenceProvider";

/**
 * @deprecated Prefer BudgetPersistenceProvider for new code. This compatibility
 * name is retained while existing consumers migrate without behavioural change.
 */
export interface AppPersistenceGateway extends BudgetPersistenceProvider {}

/** @deprecated Prefer PersistenceProviderMetadata for new code. */
export type PersistenceGatewayMetadata = PersistenceProviderMetadata;
