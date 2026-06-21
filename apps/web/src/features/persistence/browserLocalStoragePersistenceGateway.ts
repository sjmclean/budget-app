import { accountService } from "../accounts/accountService";
import { accountRegisterService } from "../accounts/accountRegisterService";
import { payeeService } from "../accounts/payeeService";
import { scheduledTransactionService } from "../accounts/scheduledTransactionService";
import { budgetViewService } from "../budget/budgetViewService";
import type { AppPersistenceGateway } from "./appPersistenceGateway";

export const browserLocalStoragePersistenceGateway: AppPersistenceGateway = {
  metadata: {
    kind: "browser-local-storage",
    label: "Browser localStorage",
    description:
      "The web UI is currently using browser localStorage-backed feature services. This gateway preserves existing behaviour while SQLite-backed adapters are introduced incrementally.",
    isProductionPersistence: false,
  },
  accounts: accountService,
  accountRegisters: accountRegisterService,
  budgetView: budgetViewService,
  categories: budgetViewService,
  payees: payeeService,
  scheduledTransactions: scheduledTransactionService,
};
