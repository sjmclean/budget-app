import type { KeyValueStoragePort } from "../../persistence/keyValueStoragePort";
import {
  createBudgetRegistryEntry,
  deleteBudgetRegistryEntry,
  type BudgetSummary,
} from "../budgetRegistry";
import { getCurrentBudgetMonth } from "../budgetMonthNavigation";
import {
  createBudgetMonthView,
} from "./createBudgetFromSetup";
import {
  getSelectedCategoryGroups,
  type NewBudgetSetup,
} from "./budgetTemplates";
import {
  emptyDomainCounts,
} from "../../persistence/localFirst/contracts";
import { LocalBudgetDatabaseClient } from "../../persistence/localFirst/localBudgetClient";
import { getOrCreateLocalFirstDeviceId } from "../../persistence/localFirst/localFirstDeviceId";
import { provisionFreshLocalFirstBudget } from "../../persistence/localFirst/freshBudgetProvisioning";
import { publishLocalBaseline } from "../../persistence/localFirst/baselineCoordinator";

export async function createLocalFirstBudgetFromSetup(
  storage: KeyValueStoragePort,
  setup: NewBudgetSetup,
  now = new Date(),
): Promise<BudgetSummary> {
  const budget = createBudgetRegistryEntry(storage, {
    name: setup.name,
    currency: setup.currency,
    dateFormat: setup.dateFormat,
    numberFormat: setup.numberFormat,
    firstDayOfWeek: setup.firstDayOfWeek,
    now,
  });

  let provisioned:
    | Awaited<ReturnType<typeof provisionFreshLocalFirstBudget>>
    | null = null;
  let database: LocalBudgetDatabaseClient | null = null;
  let staged = false;

  try {
    provisioned = await provisionFreshLocalFirstBudget(budget.id);

    database = new LocalBudgetDatabaseClient();

    await database.beginStagedImport({
      budgetId: budget.id,
      syncEpoch: provisioned.syncEpoch,
      deviceId: getOrCreateLocalFirstDeviceId(storage),
    });
    staged = true;

    const categories = getSelectedCategoryGroups(setup.categoryGroups)
      .flatMap((group) =>
        group.categories.map((category) => ({
          id: category.id,
          budgetId: budget.id,
          name: category.name,
          groupId: group.id,
          groupName: group.name,
          archived: false,
        })),
      );

    if (categories.length > 0) {
      await database.importRegisterBatch({ categories });
    }

    const month = getCurrentBudgetMonth(now);
    const view = createBudgetMonthView(budget, setup, now);

    await database.importEntityBatch([
      {
        domain: "budgetMonths",
        entityId: month,
        payload: view,
      },
    ]);

    const expectedCounts = {
      ...emptyDomainCounts(),
      categories: categories.length,
      budgetMonths: 1,
    };

    await database.commitStagedImport(expectedCounts);
    staged = false;

    await publishLocalBaseline({
      budgetId: budget.id,
      budgetName: budget.name,
      currency: budget.currency,
      syncEpoch: provisioned.syncEpoch,
      database,
      relay: provisioned.relay,
    });

    await database.close();
    database = null;

    return budget;
  } catch (error) {
    if (database) {
      if (staged) {
        await database.rollbackStagedImport().catch(() => undefined);
      }
      await database.close().catch(() => undefined);
    }

    if (provisioned) {
      await provisioned.relay.deleteBudget(budget.id).catch(() => undefined);
    }

    deleteBudgetRegistryEntry(storage, budget.id);
    throw error;
  }
}
