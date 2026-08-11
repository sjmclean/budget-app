import { LOCAL_BUDGET_SCHEMA_VERSION } from "./contracts";
import {
  createLocalFirstRelayTransport,
  type RelayBootstrap,
} from "./relayTransport";

export interface FreshLocalFirstBudgetProvisioningOptions {
  readonly apiBaseUrl?: string;
  readonly fetchImplementation?: typeof fetch;
}

export interface FreshLocalFirstBudgetProvisioningResult {
  readonly syncEpoch: string;
  readonly bootstrap: RelayBootstrap;
  readonly relay: ReturnType<typeof createLocalFirstRelayTransport>;
}

/** Only genuine fresh-budget creation/import workflows may call this. */
export async function provisionFreshLocalFirstBudget(
  budgetId: string,
  options: FreshLocalFirstBudgetProvisioningOptions = {},
): Promise<FreshLocalFirstBudgetProvisioningResult> {
  const relay = createLocalFirstRelayTransport(options);
  let provisioned = false;

  try {
    await relay.provisionBudget(budgetId);
    provisioned = true;
    const epoch = await relay.resetEpoch(budgetId, LOCAL_BUDGET_SCHEMA_VERSION);
    const bootstrap = await relay.getBootstrap(budgetId);
    if (bootstrap.syncEpoch !== epoch.syncEpoch) {
      throw new Error("Fresh budget bootstrap returned a different sync epoch.");
    }
    return { syncEpoch: epoch.syncEpoch, bootstrap, relay };
  } catch (error) {
    if (provisioned) {
      await relay.deleteBudget(budgetId).catch(() => undefined);
    }
    throw error;
  }
}
