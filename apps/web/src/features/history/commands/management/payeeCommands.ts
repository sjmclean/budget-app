import type { UpdatePayeeInput, PayeeView } from "../../../accounts/payeeService";
import type { ApplicationHistoryContext } from "../../applicationHistory";
import type { UndoableCommand } from "../../undoRedo";

function queries(context: ApplicationHistoryContext) {
  const value = context.persistence.accountRegisterQueries;
  if (!value) throw new Error("Payee history requires authoritative SQLite persistence.");
  return value;
}

function change(input: {
  id: string; label: string; payeeId: string;
  mutate: (context: ApplicationHistoryContext) => Promise<void>;
}): UndoableCommand<ApplicationHistoryContext> {
  let before: PayeeView | null = null;
  let after: PayeeView | null = null;
  return {
    id: input.id, label: input.label,
    async execute(context) {
      before = await queries(context).capturePayee(context.budgetId, input.payeeId);
      if (!before) throw new Error("Payee was not found.");
      await input.mutate(context);
      after = await queries(context).capturePayee(context.budgetId, input.payeeId);
      if (!after) throw new Error("Updated payee could not be recaptured.");
    },
    async undo(context) {
      if (!before || !after) throw new Error("Payee command has incomplete state.");
      await queries(context).replacePayeeHistoryState({ budgetId: context.budgetId, payeeId: input.payeeId, expected: after, replacement: before });
    },
    async redo(context) {
      if (!before || !after) throw new Error("Payee command has incomplete state.");
      await queries(context).replacePayeeHistoryState({ budgetId: context.budgetId, payeeId: input.payeeId, expected: before, replacement: after });
    },
  };
}

export function createPayeeCommand(payeeId: string, name: string): UndoableCommand<ApplicationHistoryContext> {
  let after: PayeeView | null = null;
  return {
    id: `create-payee:${payeeId}`, label: "Create payee",
    async execute(context) {
      if (await queries(context).capturePayee(context.budgetId, payeeId)) throw new Error("Payee already exists.");
      await queries(context).createPayee(context.budgetId, name, payeeId);
      after = await queries(context).capturePayee(context.budgetId, payeeId);
      if (!after) throw new Error("Created payee could not be recaptured.");
    },
    async undo(context) {
      if (!after) throw new Error("Create payee command has no state.");
      await queries(context).replacePayeeHistoryState({ budgetId: context.budgetId, payeeId, expected: after, replacement: null });
    },
    async redo(context) {
      if (!after) throw new Error("Create payee command has no state.");
      await queries(context).replacePayeeHistoryState({ budgetId: context.budgetId, payeeId, expected: null, replacement: after });
    },
  };
}

export function updatePayeeCommand(write: Pick<UpdatePayeeInput, "id"> & Partial<Omit<UpdatePayeeInput, "id">>) {
  return change({ id: `update-payee:${write.id}:${Date.now()}`, label: "Update payee", payeeId: write.id, mutate: async (context) => { await queries(context).updatePayee(context.budgetId, write); } });
}

export function setPayeeArchivedCommand(payeeId: string, archived: boolean) {
  return change({ id: `archive-payee:${payeeId}:${Date.now()}`, label: archived ? "Archive payee" : "Restore payee", payeeId, mutate: async (context) => { await queries(context).setPayeeArchived(context.budgetId, payeeId, archived); } });
}

export function deleteUnusedPayeeCommand(payeeId: string): UndoableCommand<ApplicationHistoryContext> {
  let before: PayeeView | null = null;
  return {
    id: `delete-payee:${payeeId}:${Date.now()}`, label: "Delete payee",
    async execute(context) {
      before = await queries(context).capturePayee(context.budgetId, payeeId);
      if (!before || !queries(context).deleteUnusedPayee) throw new Error("Payee cannot be deleted.");
      await queries(context).deleteUnusedPayee!(context.budgetId, payeeId);
    },
    async undo(context) {
      if (!before) throw new Error("Delete payee command has no state.");
      await queries(context).replacePayeeHistoryState({ budgetId: context.budgetId, payeeId, expected: null, replacement: before });
    },
    async redo(context) {
      if (!before) throw new Error("Delete payee command has no state.");
      await queries(context).replacePayeeHistoryState({ budgetId: context.budgetId, payeeId, expected: before, replacement: null });
    },
  };
}

type SuppressionPair = { readonly leftPayeeId: string; readonly rightPayeeId: string };

export function keepPayeesSeparateCommand(additions: readonly SuppressionPair[]): UndoableCommand<ApplicationHistoryContext> {
  let before: readonly SuppressionPair[] = [];
  let after: readonly SuppressionPair[] = [];
  return {
    id: `keep-payees-separate:${Date.now()}`, label: "Keep payees separate",
    async execute(context) {
      const client = queries(context);
      if (!client.listPayeeDuplicateSuppressions || !client.keepPayeesSeparate ||
          !client.replacePayeeDuplicateSuppressionsHistoryState) {
        throw new Error("Payee suppression history is unavailable.");
      }
      before = await client.listPayeeDuplicateSuppressions(context.budgetId);
      await client.keepPayeesSeparate(context.budgetId, additions);
      after = await client.listPayeeDuplicateSuppressions(context.budgetId);
    },
    async undo(context) {
      await queries(context).replacePayeeDuplicateSuppressionsHistoryState!({ budgetId: context.budgetId, expected: after, replacement: before });
    },
    async redo(context) {
      await queries(context).replacePayeeDuplicateSuppressionsHistoryState!({ budgetId: context.budgetId, expected: before, replacement: after });
    },
  };
}
