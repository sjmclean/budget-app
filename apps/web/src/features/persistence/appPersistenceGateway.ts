import type { AccountPersistencePort } from "../accounts/accountPersistencePort";
import type { AccountRegisterService } from "../accounts/accountRegisterTypes";
import type { PayeePersistencePort } from "../accounts/payeePersistencePort";
import type { ScheduledTransactionPersistencePort } from "../accounts/scheduledTransactionPersistencePort";
import type { CategoryPersistencePort } from "../budget/categoryPersistencePort";
import type { BudgetViewService } from "../budget/budgetViewTypes";

export type PersistenceBackendKind = "browser-local-storage" | "sqlite-adapter";

export interface PersistenceGatewayMetadata {
  readonly kind: PersistenceBackendKind;
  readonly label: string;
  readonly description: string;
  readonly isProductionPersistence: boolean;
}

/**
 * Browser-safe persistence boundary for the React app.
 *
 * The web UI must depend on this port rather than importing database, filesystem,
 * better-sqlite3, or Tauri-specific modules directly. For now the default
 * implementation delegates to the existing localStorage feature services so
 * behaviour stays unchanged while each service is migrated behind this seam.
 */
export interface AppPersistenceGateway {
  readonly metadata: PersistenceGatewayMetadata;
  readonly accounts: AccountPersistencePort;
  readonly accountRegisters: AccountRegisterService;
  readonly budgetView: BudgetViewService;
  readonly categories: CategoryPersistencePort;
  readonly payees: PayeePersistencePort;
  readonly scheduledTransactions: ScheduledTransactionPersistencePort;
}
