import type { LocalBudgetRuntimeClient } from "../../accountRegisterQueryContracts";
import type { PersistenceChangeScope } from "../../persistenceChangeBus";
import { createRuntimeUuid } from "../../../ids/createRuntimeUuid";
import { validatePayeeIconReferenceForWrite } from "../../../icons/payeeIconReference";
import type { LocalBudgetMutation, LocalBudgetOperationGroup } from "../contracts";
import type { LocalBudgetDatabaseClient } from "../localBudgetClient";
import { localPayeeRecordToView } from "../localPayeeView";

type PayeeCommands = Pick<
  LocalBudgetRuntimeClient,
  | "keepPayeesSeparate"
  | "replacePayeeDuplicateSuppressionsHistoryState"
  | "createPayee"
  | "replacePayeeHistoryState"
  | "updatePayee"
  | "setPayeeArchived"
  | "deleteUnusedPayee"
  | "mergePayees"
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

export interface PayeeCommandDependencies {
  readonly requireDatabase: (budgetId: string) => Promise<LocalBudgetDatabaseClient>;
  readonly createMutation: CreateMutation;
  readonly recordCommittedChange: (
    budgetId: string,
    change: Omit<PersistenceChangeScope, "budgetId">,
  ) => void;
}

async function listPersistedPayees(
  local: LocalBudgetDatabaseClient,
  budgetId: string,
  archived: boolean,
) {
  return (await local.listPayees(budgetId, archived)).map(localPayeeRecordToView);
}

async function allPersistedPayees(
  local: LocalBudgetDatabaseClient,
  budgetId: string,
) {
  return [
    ...await local.listPayees(budgetId, false),
    ...await local.listPayees(budgetId, true),
  ];
}

/** Final implementation owner for ordinary payee commands. */
export function createPayeeCommands(
  dependencies: PayeeCommandDependencies,
): PayeeCommands {
  const recordPayeesCommitted = (budgetId: string): void =>
    dependencies.recordCommittedChange(budgetId, { domains: ["payees"] });

  return {
    async keepPayeesSeparate(budgetId, pairs) {
      const local = await dependencies.requireDatabase(budgetId);
      await local.keepPayeesSeparate(budgetId, pairs);
      recordPayeesCommitted(budgetId);
    },

    async replacePayeeDuplicateSuppressionsHistoryState(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      await local.replacePayeeDuplicateSuppressionsHistoryState(input);
      recordPayeesCommitted(input.budgetId);
    },

    async createPayee(budgetId, name, payeeId) {
      const payee = {
        id: payeeId ?? createRuntimeUuid(),
        budgetId,
        name: name.trim(),
        note: "",
        archived: false,
      };
      const local = await dependencies.requireDatabase(budgetId);
      await local.writePayee(
        payee,
        dependencies.createMutation(budgetId, "payees", payee.id, "upsert", payee),
      );
      recordPayeesCommitted(budgetId);
      return listPersistedPayees(local, budgetId, false);
    },

    async replacePayeeHistoryState(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const current = (await allPersistedPayees(local, input.budgetId))
        .map(localPayeeRecordToView)
        .find(({ id }) => id === input.payeeId) ?? null;
      if (JSON.stringify(current) !== JSON.stringify(input.expected)) {
        throw new Error("PAYEE_HISTORY_CONFLICT");
      }
      if (input.replacement) {
        const { isArchived, ...replacement } = input.replacement;
        const payee = {
          ...replacement,
          budgetId: input.budgetId,
          note: replacement.note ?? "",
          archived: isArchived === true,
        };
        await local.writePayee(
          payee,
          dependencies.createMutation(
            input.budgetId,
            "payees",
            input.payeeId,
            "upsert",
            payee,
          ),
        );
      } else {
        await local.deleteUnusedPayee(
          input.budgetId,
          input.payeeId,
          dependencies.createMutation(
            input.budgetId,
            "payees",
            input.payeeId,
            "delete",
            { kind: "history" },
          ),
        );
      }
      recordPayeesCommitted(input.budgetId);
    },

    async updatePayee(budgetId, input) {
      const local = await dependencies.requireDatabase(budgetId);
      const current = (await allPersistedPayees(local, budgetId))
        .find((row) => row.id === input.id);
      if (!current) throw new Error("The local payee was not found.");
      const payee = {
        id: current.id,
        budgetId,
        name: input.name ?? current.name,
        note: input.note ?? current.note,
        archived: current.archived,
        defaultCategoryId: input.defaultCategoryId ?? current.defaultCategoryId,
        defaultCategoryName: input.defaultCategoryName ?? current.defaultCategoryName,
        aliases: input.aliases ?? current.aliases,
        importRules: input.importRules ?? current.importRules,
        iconRef: input.iconUpdate
          ? input.iconUpdate.kind === "automatic"
            ? ""
            : validatePayeeIconReferenceForWrite(input.iconUpdate.iconRef)
          : current.iconRef,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
      };
      await local.writePayee(
        payee,
        dependencies.createMutation(budgetId, "payees", payee.id, "upsert", payee),
      );
      recordPayeesCommitted(budgetId);
      return listPersistedPayees(local, budgetId, false);
    },

    async setPayeeArchived(budgetId, payeeId, archived) {
      const local = await dependencies.requireDatabase(budgetId);
      const current = (await allPersistedPayees(local, budgetId))
        .find((row) => row.id === payeeId);
      if (!current) throw new Error("The local payee was not found.");
      const payee = { ...current, budgetId, archived };
      await local.writePayee(
        payee,
        dependencies.createMutation(budgetId, "payees", payee.id, "upsert", payee),
      );
      recordPayeesCommitted(budgetId);
      return listPersistedPayees(local, budgetId, archived);
    },

    async deleteUnusedPayee(budgetId, payeeId) {
      const local = await dependencies.requireDatabase(budgetId);
      await local.deleteUnusedPayee(
        budgetId,
        payeeId,
        dependencies.createMutation(
          budgetId,
          "payees",
          payeeId,
          "delete",
          { kind: "unused-payee-delete" },
        ),
      );
      recordPayeesCommitted(budgetId);
      return listPersistedPayees(local, budgetId, false);
    },

    async mergePayees(budgetId, input) {
      const local = await dependencies.requireDatabase(budgetId);
      const target = (await allPersistedPayees(local, budgetId))
        .find(({ id }) => id === input.targetPayeeId);
      if (!target) throw new Error("The target local payee was not found.");
      const payload = {
        targetPayeeId: target.id,
        targetPayeeName: target.name,
      };
      await local.mergePayees({
        budgetId,
        sourcePayeeId: input.sourcePayeeId,
        sourcePayeeIds: input.sourcePayeeIds,
        targetPayeeId: target.id,
        targetPayeeName: target.name,
        updateLinkedTransactions: input.updateLinkedTransactions,
        updateScheduledTransactions: input.updateScheduledTransactions,
        addMergedAliases: input.addMergedAliases,
        redirectRecognitionRules: input.redirectRecognitionRules,
        mutation: dependencies.createMutation(
          budgetId,
          "payees",
          input.sourcePayeeId,
          "delete",
          {
            ...payload,
            sourcePayeeIds: input.sourcePayeeIds,
            updateLinkedTransactions: input.updateLinkedTransactions,
            updateScheduledTransactions: input.updateScheduledTransactions,
            addMergedAliases: input.addMergedAliases,
            redirectRecognitionRules: input.redirectRecognitionRules,
          },
        ),
      });
      dependencies.recordCommittedChange(budgetId, {
        domains: [
          "payees",
          ...(input.updateLinkedTransactions ? ["transactions" as const] : []),
          ...(input.updateScheduledTransactions
            ? ["scheduled-transactions" as const]
            : []),
        ],
      });
      return listPersistedPayees(local, budgetId, false);
    },
  };
}
