import type { AccountRegisterPersistencePort } from "../accounts/accountRegisterPersistencePort.js";
import type { AccountPersistencePort } from "../accounts/accountPersistencePort.js";
import type { PayeePersistencePort } from "../accounts/payeePersistencePort.js";
import type { ScheduledTransactionPersistencePort } from "../accounts/scheduledTransactionPersistencePort.js";
import type { BudgetActivityPersistencePort } from "../budget/budgetActivityPersistencePort.js";
import type { CategoryPersistencePort } from "../budget/categoryPersistencePort.js";
import type { BudgetViewService } from "../budget/budgetViewTypes.js";
import type { AppPersistenceGateway } from "./appPersistenceGateway.js";

export interface SqlitePersistenceGatewayDependencies {
  accounts: AccountPersistencePort;
  payees: PayeePersistencePort;
  accountRegisters: AccountRegisterPersistencePort;
  budgetView: BudgetViewService;
  categories: CategoryPersistencePort;
  scheduledTransactions: ScheduledTransactionPersistencePort;
  budgetActivity?: BudgetActivityPersistencePort;
}

/**
 * SQLite-capable gateway composition point.
 *
 * This is intentionally not selected by appPersistenceGatewayFactory yet. A
 * future desktop/Tauri runtime can compose SQLite-backed accounts/payees here
 * while continuing to supply localStorage adapters for domains not yet ported.
 */
export function createSqlitePersistenceGateway(
  dependencies: SqlitePersistenceGatewayDependencies,
): AppPersistenceGateway {
  return {
    metadata: {
      kind: "sqlite-adapter",
      label: "SQLite adapter foundation",
      description: "SQLite-capable persistence gateway for adapter validation. Not the browser default yet.",
      isProductionPersistence: false,
    },
    capabilities: {
      sharedAcrossDevices: false,
      liveUpdates: false,
      offlineWrites: true,
      backups: false,
    },
    accounts: dependencies.accounts,
    accountRegisters: dependencies.accountRegisters,
    budgetView: dependencies.budgetView,
    categories: dependencies.categories,
    payees: dependencies.payees,
    scheduledTransactions: dependencies.scheduledTransactions,
  };
}
