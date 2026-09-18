import type { LocalBudgetRuntimeClient } from "../../accountRegisterQueryContracts";
import type { PersistenceChangeScope } from "../../persistenceChangeBus";
import { createRuntimeUuid } from "../../../ids/createRuntimeUuid";
import type { LocalBudgetMutation, LocalBudgetOperationGroup } from "../contracts";
import type { LocalBudgetDatabaseClient } from "../localBudgetClient";
import { committedCommandResult, emptyCommandChange, type CommittedCommandMethods } from "./commandContext";

type AccountCommands = Pick<
  LocalBudgetRuntimeClient,
  | "createAccount"
  | "replaceAccountHistoryState"
  | "updateAccount"
  | "setAccountClosed"
  | "deleteAccount"
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

export interface AccountCommandDependencies {
  readonly requireDatabase: (budgetId: string) => Promise<LocalBudgetDatabaseClient>;
  readonly createMutation: CreateMutation;
}

async function listLocalAccounts(local: LocalBudgetDatabaseClient, budgetId: string) {
  return local.listAccountNavigation(budgetId).then((rows) => rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type as never,
    startingBalance: row.openingBalance / 100,
    isClosed: row.closedAt !== null,
    createdAt: row.closedAt ?? new Date(0).toISOString(),
    closedAt: row.closedAt ?? undefined,
  })));
}

/** Final implementation owner for ordinary account commands and account history replacement. */
export function createAccountCommands(dependencies: AccountCommandDependencies): CommittedCommandMethods<AccountCommands> {
  return {
    async createAccount(budgetId, input) {
      const local = await dependencies.requireDatabase(budgetId);
      const navigation = await local.listAccountNavigation(budgetId);
      const currencyCode = navigation[0]?.currencyCode ?? "AUD";
      const now = new Date().toISOString();
      const account = {
        id: input.id ?? createRuntimeUuid(),
        budgetId,
        name: input.name,
        type: input.type,
        participation: input.type === "tracking" ? "off-budget" as const : "on-budget" as const,
        openingBalance: Math.round(input.startingBalance * 100),
        currencyCode,
        createdAt: now,
        closedAt: null,
      };
      const mutation = dependencies.createMutation(budgetId, "accounts", account.id, "upsert", account);
      await local.writeAccount(account, mutation);
      const result = await listLocalAccounts(local, budgetId);
      return committedCommandResult(result, [mutation], { budgetId,
        domains: ["accounts", "budget"],
        accountIds: [account.id],
      });
    },

    async replaceAccountHistoryState(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const mutation = dependencies.createMutation(
        input.budgetId, "accounts", input.accountId, input.replacement ? "upsert" : "delete", input.replacement,
      );
      await local.replaceAccountHistoryState({
        accountId: input.accountId,
        expected: input.expected,
        replacement: input.replacement,
        mutation,
      });
      const affectsBudget =
        input.expected?.participation !== input.replacement?.participation ||
        input.expected?.openingBalance !== input.replacement?.openingBalance;
      return committedCommandResult(undefined, [mutation], { budgetId: input.budgetId,
        domains: affectsBudget ? ["accounts", "budget"] : ["accounts"],
        accountIds: [input.accountId],
      });
    },

    async updateAccount(budgetId, input) {
      const local = await dependencies.requireDatabase(budgetId);
      const current = (await local.listAccountNavigation(budgetId)).find(({ id }) => id === input.id);
      if (!current) throw new Error("The local account was not found.");
      const account = {
        id: current.id,
        budgetId,
        name: input.name,
        type: input.type,
        participation: input.type === "tracking" ? "off-budget" as const : "on-budget" as const,
        openingBalance: current.openingBalance,
        currencyCode: current.currencyCode,
        createdAt: new Date(0).toISOString(),
        closedAt: current.closedAt,
      };
      const mutation = dependencies.createMutation(budgetId, "accounts", account.id, "upsert", account);
      await local.writeAccount(account, mutation);
      const result = await listLocalAccounts(local, budgetId);
      return committedCommandResult(result, [mutation], { budgetId,
        domains: current.participation === account.participation ? ["accounts"] : ["accounts", "budget"],
        accountIds: [account.id],
      });
    },

    async setAccountClosed(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const current = (await local.listAccountNavigation(input.budgetId)).find(({ id }) => id === input.accountId);
      if (!current) throw new Error("The local account was not found.");
      const account = {
        id: current.id,
        budgetId: input.budgetId,
        name: current.name,
        type: current.type,
        participation: current.participation,
        openingBalance: current.openingBalance,
        currencyCode: current.currencyCode,
        createdAt: new Date(0).toISOString(),
        closedAt: input.closed ? new Date().toISOString() : null,
      };
      const mutation = dependencies.createMutation(input.budgetId, "accounts", account.id, "upsert", account);
      await local.writeAccount(account, mutation);
      return committedCommandResult(undefined, [mutation], { budgetId: input.budgetId,
        domains: ["accounts"],
        accountIds: [input.accountId],
      });
    },

    async deleteAccount(budgetId, accountId) {
      const local = await dependencies.requireDatabase(budgetId);
      const mutation = dependencies.createMutation(budgetId, "accounts", accountId, "delete", null);
      try {
        await local.deleteAccount(
          budgetId,
          accountId,
          mutation,
        );
        const result = { deleted: true as const, accounts: [...await listLocalAccounts(local, budgetId)] };
        return committedCommandResult(result, [mutation], { budgetId,
          domains: ["accounts", "budget"],
          accountIds: [accountId],
        });
      } catch (error) {
        if ((error as { code?: string }).code !== "ACCOUNT_NOT_EMPTY") throw error;
        const result = {
          deleted: false as const,
          reason: "This account contains transactions and cannot be deleted.",
          accounts: [...await listLocalAccounts(local, budgetId)],
        };
        return committedCommandResult(result, [], emptyCommandChange(budgetId));
      }
    },
  };
}
