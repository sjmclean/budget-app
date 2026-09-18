import type { CategoryMutation, LocalBudgetRuntimeClient } from "../../accountRegisterQueryContracts";
import type { PersistenceChangeScope } from "../../persistenceChangeBus";
import { isCreditCardPaymentCategory } from "../../../budget/creditCardPaymentCategories";
import { projectCategoryGoalsOntoBudgetView } from "../../../budget/categoryGoalBudgetProjection";
import type { BudgetMonthView } from "../../../budget/budgetViewTypes";
import { createRuntimeUuid } from "../../../ids/createRuntimeUuid";
import type { LocalBudgetMutation, LocalBudgetOperationGroup } from "../contracts";
import type { LocalBudgetDatabaseClient } from "../localBudgetClient";
import { persistenceScopeForMutations } from "../mutationEvents";
import { mutateBudgetCategory } from "./categoryCommandHelpers";
import { committedCommandResult, type CommittedCommandMethods } from "./commandContext";

type BudgetCategoryCommands = Pick<
  LocalBudgetRuntimeClient,
  "setCategoryAssignedValues" | "mutateCategory" | "replaceBudgetMonthHistoryState"
>;

type CreateMutation = (
  budgetId: string,
  domain: LocalBudgetMutation["domain"],
  entityId: string,
  operation: LocalBudgetMutation["operation"],
  payload: unknown,
  operationGroupId?: string,
  operationGroup?: LocalBudgetOperationGroup,
) => LocalBudgetMutation;

export interface BudgetCategoryCommandDependencies {
  readonly requireDatabase: (budgetId: string) => Promise<LocalBudgetDatabaseClient>;
  readonly createMutation: CreateMutation;
}

async function readBudgetMonth(
  local: LocalBudgetDatabaseClient,
  budgetId: string,
  month: string,
): Promise<BudgetMonthView> {
  const view = await local.readEntity<BudgetMonthView>("budgetMonths", month);
  if (!view) throw new Error(`Budget month ${month} is not available locally.`);
  return view;
}

async function readCreatedBudgetMonth(
  local: LocalBudgetDatabaseClient,
  budgetId: string,
  month: string,
): Promise<BudgetMonthView> {
  const [view, goals] = await Promise.all([
    readBudgetMonth(local, budgetId, month),
    local.listCategoryGoals(budgetId),
  ]);
  return projectCategoryGoalsOntoBudgetView(view, month, goals);
}

/** Final implementation owner for ordinary budget-month and category commands. */
export function createBudgetCategoryCommands(
  dependencies: BudgetCategoryCommandDependencies,
): CommittedCommandMethods<BudgetCategoryCommands> {
  async function writeBudgetMonth(
    local: LocalBudgetDatabaseClient,
    budgetId: string,
    month: string,
    view: BudgetMonthView,
  ) {
    const committedMutation = dependencies.createMutation(
      budgetId, "budgetMonths", month, "upsert", view,
    );
    await local.mutate(committedMutation);
    return { mutation: committedMutation, change: persistenceScopeForMutations(budgetId, [committedMutation]) };
  }

  return {
    async replaceBudgetMonthHistoryState(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const mutation = dependencies.createMutation(
        input.budgetId, "budgetMonths", input.month, "upsert", input.replacement,
      );
      await local.replaceBudgetMonthHistoryState({
        month: input.month,
        expected: input.expected,
        replacement: input.replacement,
        mutation,
      });
      return committedCommandResult(undefined, [mutation], { budgetId: input.budgetId,
        domains: ["budget", "categories"], months: [input.month],
      });
    },

    async setCategoryAssignedValues(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const mutations = input.assignments.map(({ categoryId, assigned }) =>
        dependencies.createMutation(
          input.budgetId,
          "budgetMonths",
          `assignment:${input.month}:${categoryId}`,
          "upsert",
          { kind: "category-assignment", month: input.month, categoryId, assigned },
        ));
      await local.mutateBatch(mutations);
      // Assigned and available balances roll forward. Preserve entity precision
      // while intentionally omitting month scope so every later projection is stale.
      const result = await readBudgetMonth(local, input.budgetId, input.month);
      return committedCommandResult(result, mutations, { budgetId: input.budgetId,
        domains: ["budget", "categories"],
        categoryIds: input.assignments.map(({ categoryId }) => categoryId),
      });
    },

    async mutateCategory(budgetId, input: CategoryMutation) {
      const local = await dependencies.requireDatabase(budgetId);
      const view = await readBudgetMonth(local, budgetId, input.month);
      const next = mutateBudgetCategory(view, input);
      if (input.operation === "overspending") {
        const categoryId = String(input.categoryId);
        const policy = input.overspendingHandling as "reduce-next-month" | "carry-category";
        const committedMutation = dependencies.createMutation(
          budgetId,
          "budgetMonths",
          `policy:${input.month}:${categoryId}`,
          "upsert",
          { kind: "category-overspending-policy", startMonth: input.month, categoryId, policy },
        );
        await local.mutateBatch([committedMutation]);
        // Policy changes can cascade into later months, so month scope remains omitted.
        const result = await readBudgetMonth(local, budgetId, input.month);
        return committedCommandResult(result, [committedMutation], { budgetId,
          domains: ["budget", "categories"], categoryIds: [categoryId],
        });
      }
      if (input.operation === "merge") {
        const targetCategoryId = String(input.targetCategoryId);
        const sourceCategoryId = String(input.categoryId);
        if (
          isCreditCardPaymentCategory(sourceCategoryId) ||
          isCreditCardPaymentCategory(targetCategoryId)
        ) {
          throw new Error("Managed credit-card payment categories cannot be merged.");
        }
        const target = view.categoryGroups.flatMap(({ categories }) => categories)
          .find(({ id }) => id === targetCategoryId);
        if (!target) throw new Error("The target local category was not found.");
        const payload = { targetCategoryId, targetCategoryName: target.name };
        const operationGroupId = createRuntimeUuid();
        const operationGroup: LocalBudgetOperationGroup = {
          members: [
            {
              domain: "categories",
              entityId: sourceCategoryId,
              operation: "delete",
              payload,
            },
            {
              domain: "budgetMonths",
              entityId: input.month,
              operation: "upsert",
              payload: next,
            },
          ],
        };
        const mergeMutation = dependencies.createMutation(
          budgetId,
          "categories",
          sourceCategoryId,
          "delete",
          payload,
          operationGroupId,
          operationGroup,
        );
        const budgetMonthMutation = dependencies.createMutation(
          budgetId,
          "budgetMonths",
          input.month,
          "upsert",
          next,
          operationGroupId,
          operationGroup,
        );
        await local.mergeCategories({
          budgetId,
          sourceCategoryId,
          targetCategoryId,
          targetCategoryName: target.name,
          mutation: mergeMutation,
          budgetMonthMutation,
        });
        const result = await readBudgetMonth(local, budgetId, input.month);
        return committedCommandResult(result, [mergeMutation, budgetMonthMutation],
          persistenceScopeForMutations(
            budgetId,
            [mergeMutation, budgetMonthMutation],
          ),
        );
      }
      const committed = await writeBudgetMonth(local, budgetId, input.month, next);
      const result = input.operation === "create"
        ? readCreatedBudgetMonth(local, budgetId, input.month)
        : readBudgetMonth(local, budgetId, input.month);
      return committedCommandResult(await result, [committed.mutation], committed.change);
    },
  };
}
