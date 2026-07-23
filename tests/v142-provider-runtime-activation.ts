import assert from "node:assert/strict";

import type { BudgetPersistenceProvider } from "../apps/web/src/features/persistence/budgetPersistenceProvider.js";
import { browserLocalStoragePersistenceGateway } from "../apps/web/src/features/persistence/browserLocalStoragePersistenceGateway.js";
import {
  configureBudgetPersistenceProvider,
  getBudgetPersistenceProvider,
  resetBudgetPersistenceProvider,
} from "../apps/web/src/features/persistence/budgetPersistenceProviderFactory.js";
import { getAppPersistenceGateway } from "../apps/web/src/features/persistence/appPersistenceGatewayFactory.js";

const configuredProvider: BudgetPersistenceProvider = {
  ...browserLocalStoragePersistenceGateway,
  metadata: {
    ...browserLocalStoragePersistenceGateway.metadata,
    label: "Configured provider",
  },
};

resetBudgetPersistenceProvider();
assert.equal(
  getBudgetPersistenceProvider(),
  browserLocalStoragePersistenceGateway,
  "browser localStorage remains the default provider",
);

configureBudgetPersistenceProvider(configuredProvider);
assert.equal(
  getBudgetPersistenceProvider(),
  configuredProvider,
  "the canonical provider selector returns the configured runtime provider",
);
assert.equal(
  getAppPersistenceGateway(),
  configuredProvider,
  "the compatibility gateway selector delegates to the canonical provider selector",
);

resetBudgetPersistenceProvider();
assert.equal(
  getBudgetPersistenceProvider(),
  browserLocalStoragePersistenceGateway,
  "reset restores the browser provider",
);

console.log("v1.42 provider runtime activation validation passed");
