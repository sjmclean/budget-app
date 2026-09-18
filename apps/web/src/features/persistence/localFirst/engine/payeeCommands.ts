import type { LocalBudgetRuntimeClient } from "../../accountRegisterQueryContracts";
import type { PersistenceChangeScope } from "../../persistenceChangeBus";
import { validatePayeeIconReferenceForWrite } from "../../../icons/payeeIconReference";
import { createRuntimeUuid } from "../../../ids/createRuntimeUuid";
import type { LocalBudgetMutation, LocalBudgetOperationGroup } from "../contracts";
import type { LocalBudgetDatabaseClient } from "../localBudgetClient";
import { localPayeeRecordToView } from "../localPayeeView";
import { committedCommandResult, type CommittedCommandMethods } from "./commandContext";

type PayeeCommands = Pick<LocalBudgetRuntimeClient,
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
}

async function listPersistedPayees(local: LocalBudgetDatabaseClient, budgetId: string, archived: boolean) {
  return (await local.listPayees(budgetId, archived)).map(localPayeeRecordToView);
}

async function findPersistedPayee(local: LocalBudgetDatabaseClient, budgetId: string, payeeId: string) {
  const rows = [...await local.listPayees(budgetId, false), ...await local.listPayees(budgetId, true)];
  return rows.find(({ id }) => id === payeeId);
}

/** Final implementation owner for ordinary payee commands. */
export function createPayeeCommands(dependencies: PayeeCommandDependencies): CommittedCommandMethods<PayeeCommands> {
  const payeeChange = (budgetId: string): PersistenceChangeScope => ({ budgetId, domains: ["payees"] });

  return {
    async keepPayeesSeparate(budgetId, pairs) {
      await (await dependencies.requireDatabase(budgetId)).keepPayeesSeparate(budgetId, pairs);
      return committedCommandResult(undefined, [], payeeChange(budgetId));
    },

    async replacePayeeDuplicateSuppressionsHistoryState(input) {
      await (await dependencies.requireDatabase(input.budgetId)).replacePayeeDuplicateSuppressionsHistoryState(input);
      return committedCommandResult(undefined, [], payeeChange(input.budgetId));
    },

    async createPayee(budgetId, name, payeeId) {
      const local = await dependencies.requireDatabase(budgetId);
      const payee = {
        id: payeeId ?? createRuntimeUuid(), budgetId, name: name.trim(), note: "", archived: false,
      };
      const mutation = dependencies.createMutation(budgetId, "payees", payee.id, "upsert", payee);
      await local.writePayee(payee, mutation);
      return committedCommandResult(await listPersistedPayees(local, budgetId, false), [mutation], payeeChange(budgetId));
    },

    async replacePayeeHistoryState(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const currentRow = await findPersistedPayee(local, input.budgetId, input.payeeId);
      const current = currentRow ? localPayeeRecordToView(currentRow) : null;
      if (JSON.stringify(current) !== JSON.stringify(input.expected)) throw new Error("PAYEE_HISTORY_CONFLICT");
      let mutation: LocalBudgetMutation;
      if (input.replacement) {
        const { isArchived, ...replacement } = input.replacement;
        const payee = { ...replacement, budgetId: input.budgetId, note: replacement.note ?? "", archived: isArchived === true };
        mutation = dependencies.createMutation(input.budgetId, "payees", input.payeeId, "upsert", payee);
        await local.writePayee(payee, mutation);
      } else {
        mutation = dependencies.createMutation(input.budgetId, "payees", input.payeeId, "delete", { kind: "history" });
        await local.deleteUnusedPayee(
          input.budgetId,
          input.payeeId,
          mutation,
        );
      }
      return committedCommandResult(undefined, [mutation], payeeChange(input.budgetId));
    },

    async updatePayee(budgetId, input) {
      const local = await dependencies.requireDatabase(budgetId);
      const current = await findPersistedPayee(local, budgetId, input.id);
      if (!current) throw new Error("The local payee was not found.");
      const payee = {
        id: current.id, budgetId,
        name: input.name ?? current.name,
        note: input.note ?? current.note,
        archived: current.archived,
        defaultCategoryId: input.defaultCategoryId ?? current.defaultCategoryId,
        defaultCategoryName: input.defaultCategoryName ?? current.defaultCategoryName,
        aliases: input.aliases ?? current.aliases,
        importRules: input.importRules ?? current.importRules,
        iconRef: input.iconUpdate
          ? input.iconUpdate.kind === "automatic" ? "" : validatePayeeIconReferenceForWrite(input.iconUpdate.iconRef)
          : current.iconRef,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
      };
      const mutation = dependencies.createMutation(budgetId, "payees", payee.id, "upsert", payee);
      await local.writePayee(payee, mutation);
      return committedCommandResult(await listPersistedPayees(local, budgetId, false), [mutation], payeeChange(budgetId));
    },

    async setPayeeArchived(budgetId, payeeId, archived) {
      const local = await dependencies.requireDatabase(budgetId);
      const current = await findPersistedPayee(local, budgetId, payeeId);
      if (!current) throw new Error("The local payee was not found.");
      const payee = { ...current, budgetId, archived };
      const mutation = dependencies.createMutation(budgetId, "payees", payee.id, "upsert", payee);
      await local.writePayee(payee, mutation);
      return committedCommandResult(await listPersistedPayees(local, budgetId, archived), [mutation], payeeChange(budgetId));
    },

    async deleteUnusedPayee(budgetId, payeeId) {
      const local = await dependencies.requireDatabase(budgetId);
      const mutation = dependencies.createMutation(budgetId, "payees", payeeId, "delete", { kind: "unused-payee-delete" });
      await local.deleteUnusedPayee(budgetId, payeeId, mutation);
      return committedCommandResult(await listPersistedPayees(local, budgetId, false), [mutation], payeeChange(budgetId));
    },

    async mergePayees(budgetId, input) {
      const local = await dependencies.requireDatabase(budgetId);
      const target = await findPersistedPayee(local, budgetId, input.targetPayeeId);
      if (!target) throw new Error("The target local payee was not found.");
      const payload = { targetPayeeId: target.id, targetPayeeName: target.name };
      const mutation = dependencies.createMutation(budgetId, "payees", input.sourcePayeeId, "delete", {
        ...payload, sourcePayeeIds: input.sourcePayeeIds,
        updateLinkedTransactions: input.updateLinkedTransactions,
        updateScheduledTransactions: input.updateScheduledTransactions,
        addMergedAliases: input.addMergedAliases, redirectRecognitionRules: input.redirectRecognitionRules,
      });
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
        mutation,
      });
      const result = await listPersistedPayees(local, budgetId, false);
      return committedCommandResult(result, [mutation], { budgetId,
        domains: ["payees", ...(input.updateLinkedTransactions ? ["transactions" as const] : []),
          ...(input.updateScheduledTransactions ? ["scheduled-transactions" as const] : [])],
      });
    },
  };
}
