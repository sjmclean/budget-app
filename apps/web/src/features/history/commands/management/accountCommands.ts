import type { CreateAccountInput, UpdateAccountInput } from "../../../accounts/accountService";
import type { LocalAccountRecord } from "../../../persistence/localFirst/registerSchema";
import type { ApplicationHistoryContext } from "../../applicationHistory";
import type { UndoableCommand } from "../../undoRedo";

function queries(context: ApplicationHistoryContext) {
  const value = context.persistence.accountRegisterQueries;
  if (!value) throw new Error("Account history requires authoritative SQLite persistence.");
  return value;
}

async function replace(context: ApplicationHistoryContext, accountId: string, expected: LocalAccountRecord | null, replacement: LocalAccountRecord | null) {
  await queries(context).replaceAccountHistoryState({ budgetId: context.budgetId, accountId, expected, replacement });
}

function accountChangeCommand(input: {
  readonly id: string; readonly label: string; readonly accountId: string;
  readonly mutate: (context: ApplicationHistoryContext) => Promise<void>;
}): UndoableCommand<ApplicationHistoryContext> {
  let before: LocalAccountRecord | null = null;
  let after: LocalAccountRecord | null = null;
  return {
    id: input.id, label: input.label,
    async execute(context) {
      before = await queries(context).captureAccount(context.budgetId, input.accountId);
      if (!before) throw new Error("Account was not found.");
      await input.mutate(context);
      after = await queries(context).captureAccount(context.budgetId, input.accountId);
      if (!after) throw new Error("Updated account could not be recaptured.");
    },
    async undo(context) { if (!before || !after) throw new Error("Account command has incomplete state."); await replace(context, input.accountId, after, before); },
    async redo(context) { if (!before || !after) throw new Error("Account command has incomplete state."); await replace(context, input.accountId, before, after); },
  };
}

export function createAccountCommand(accountId: string, write: CreateAccountInput): UndoableCommand<ApplicationHistoryContext> {
  let after: LocalAccountRecord | null = null;
  return {
    id: `create-account:${accountId}`, label: "Create account",
    async execute(context) {
      if (await queries(context).captureAccount(context.budgetId, accountId)) throw new Error("Account already exists.");
      await queries(context).createAccount(context.budgetId, { ...write, id: accountId });
      after = await queries(context).captureAccount(context.budgetId, accountId);
      if (!after) throw new Error("Created account could not be recaptured.");
    },
    async undo(context) { if (!after) throw new Error("Create account command has no state."); await replace(context, accountId, after, null); },
    async redo(context) { if (!after) throw new Error("Create account command has no state."); await replace(context, accountId, null, after); },
  };
}

export function updateAccountCommand(write: UpdateAccountInput): UndoableCommand<ApplicationHistoryContext> {
  return accountChangeCommand({
    id: `update-account:${write.id}:${Date.now()}`, label: "Update account", accountId: write.id,
    mutate: async (context) => { await queries(context).updateAccount(context.budgetId, write); },
  });
}

export function setAccountClosedCommand(accountId: string, closed: boolean): UndoableCommand<ApplicationHistoryContext> {
  return accountChangeCommand({
    id: `set-account-closed:${accountId}:${Date.now()}`, label: closed ? "Close account" : "Reopen account", accountId,
    mutate: async (context) => queries(context).setAccountClosed({ budgetId: context.budgetId, accountId, closed }),
  });
}

export function deleteEmptyAccountCommand(accountId: string): UndoableCommand<ApplicationHistoryContext> {
  let before: LocalAccountRecord | null = null;
  return {
    id: `delete-account:${accountId}:${Date.now()}`, label: "Delete account",
    async execute(context) {
      before = await queries(context).captureAccount(context.budgetId, accountId);
      if (!before) throw new Error("Account was not found.");
      const result = await queries(context).deleteAccount(context.budgetId, accountId);
      if (!result.deleted) throw new Error(result.reason ?? "Account could not be deleted.");
    },
    async undo(context) { if (!before) throw new Error("Delete account command has no state."); await replace(context, accountId, null, before); },
    async redo(context) { if (!before) throw new Error("Delete account command has no state."); await replace(context, accountId, before, null); },
  };
}
