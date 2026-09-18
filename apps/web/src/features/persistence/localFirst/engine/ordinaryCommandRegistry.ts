import {
  LOCAL_BUDGET_COMMAND_METHODS,
  type LocalBudgetCommandMethod,
  type LocalBudgetEngine,
} from "../../accountRegisterQueryContracts";
import type { CommittedCommandHandlerResult } from "./commandContext";

export type InternalCommandImplementation<Method> = Method extends (
  ...args: infer Arguments
) => Promise<infer Result>
  ? (...args: Arguments) => Promise<CommittedCommandHandlerResult<Result>>
  : never;

type InternalCommandHandler<Method> = {
  execute: InternalCommandImplementation<Method>;
};

export type OrdinaryCommandImplementations = {
  readonly [Key in LocalBudgetCommandMethod]: InternalCommandImplementation<
    NonNullable<LocalBudgetEngine[Key]>
  >;
};

/** Internal command-dispatch contract, deliberately distinct from the public
 * LocalBudgetEngine method functions. */
export type OrdinaryCommandHandlerRegistry = {
  readonly [Key in LocalBudgetCommandMethod]: InternalCommandHandler<
    NonNullable<LocalBudgetEngine[Key]>
  >;
};

const ordinaryCommandMethods = new Set<PropertyKey>(LOCAL_BUDGET_COMMAND_METHODS);

export function isOrdinaryCommandMethod(
  key: PropertyKey,
): key is LocalBudgetCommandMethod {
  return ordinaryCommandMethods.has(key);
}

/** Explicit registration is the compile-time exhaustiveness check for all
 * ordinary commands. Queries and conflict recovery cannot be members. */
export function createOrdinaryCommandHandlerRegistry(
  implementations: OrdinaryCommandImplementations,
): OrdinaryCommandHandlerRegistry {
  return {
    createCategoryGoal: { execute: (goal) => implementations.createCategoryGoal(goal) },
    updateCategoryGoal: { execute: (goal) => implementations.updateCategoryGoal(goal) },
    deleteCategoryGoal: { execute: (input) => implementations.deleteCategoryGoal(input) },
    replaceCategoryGoalHistoryState: { execute: (input) => implementations.replaceCategoryGoalHistoryState(input) },
    setAccountClosed: { execute: (input) => implementations.setAccountClosed(input) },
    addTransaction: { execute: (input) => implementations.addTransaction(input) },
    commitTransactionBatch: { execute: (input) => implementations.commitTransactionBatch(input) },
    commitImportBatch: { execute: (input) => implementations.commitImportBatch(input) },
    commitImportBatchWithHistory: { execute: (input) => implementations.commitImportBatchWithHistory(input) },
    replaceImportHistorySnapshot: { execute: (input) => implementations.replaceImportHistorySnapshot(input) },
    moveTransactions: { execute: (input) => implementations.moveTransactions(input) },
    updateTransaction: { execute: (transactionId, input) => implementations.updateTransaction(transactionId, input) },
    toggleTransactionCleared: { execute: (transactionId, input) => implementations.toggleTransactionCleared(transactionId, input) },
    setTransactionsCleared: { execute: (input) => implementations.setTransactionsCleared(input) },
    deleteTransaction: { execute: (transactionId, input) => implementations.deleteTransaction(transactionId, input) },
    restoreTransactionHistorySnapshot: { execute: (input) => implementations.restoreTransactionHistorySnapshot(input) },
    deleteTransactionHistorySnapshot: { execute: (input) => implementations.deleteTransactionHistorySnapshot(input) },
    replaceTransactionHistorySnapshot: { execute: (input) => implementations.replaceTransactionHistorySnapshot(input) },
    addTransactionAttachment: { execute: (input) => implementations.addTransactionAttachment(input) },
    removeTransactionAttachment: { execute: (input) => implementations.removeTransactionAttachment(input) },
    createAccount: { execute: (budgetId, input) => implementations.createAccount(budgetId, input) },
    replaceAccountHistoryState: { execute: (input) => implementations.replaceAccountHistoryState(input) },
    replaceBudgetMonthHistoryState: { execute: (input) => implementations.replaceBudgetMonthHistoryState(input) },
    updateAccount: { execute: (budgetId, input) => implementations.updateAccount(budgetId, input) },
    deleteAccount: { execute: (budgetId, accountId) => implementations.deleteAccount(budgetId, accountId) },
    setCategoryAssignedValues: { execute: (input) => implementations.setCategoryAssignedValues(input) },
    mutateCategory: { execute: (budgetId, mutation) => implementations.mutateCategory(budgetId, mutation) },
    keepPayeesSeparate: { execute: (budgetId, pairs) => implementations.keepPayeesSeparate!(budgetId, pairs) },
    replacePayeeDuplicateSuppressionsHistoryState: { execute: (input) => implementations.replacePayeeDuplicateSuppressionsHistoryState!(input) },
    createPayee: { execute: (budgetId, name, payeeId) => implementations.createPayee(budgetId, name, payeeId) },
    replacePayeeHistoryState: { execute: (input) => implementations.replacePayeeHistoryState(input) },
    updatePayee: { execute: (budgetId, input) => implementations.updatePayee(budgetId, input) },
    setPayeeArchived: { execute: (budgetId, payeeId, archived) => implementations.setPayeeArchived(budgetId, payeeId, archived) },
    deleteUnusedPayee: { execute: (budgetId, payeeId) => implementations.deleteUnusedPayee!(budgetId, payeeId) },
    mergePayees: { execute: (budgetId, input) => implementations.mergePayees(budgetId, input) },
    replaceTransactionTags: { execute: (budgetId, tags) => implementations.replaceTransactionTags(budgetId, tags) },
    replaceTransactionTagsHistoryState: { execute: (input) => implementations.replaceTransactionTagsHistoryState(input) },
    replaceScheduledTransactionHistoryState: { execute: (input) => implementations.replaceScheduledTransactionHistoryState(input) },
    enterScheduledTransaction: { execute: (input) => implementations.enterScheduledTransaction(input) },
    createScheduledTransaction: { execute: (budgetId, input) => implementations.createScheduledTransaction(budgetId, input) },
    updateScheduledTransaction: { execute: (budgetId, scheduleId, input) => implementations.updateScheduledTransaction(budgetId, scheduleId, input) },
    deleteScheduledTransaction: { execute: (budgetId, accountId, scheduleId) => implementations.deleteScheduledTransaction(budgetId, accountId, scheduleId) },
    advanceScheduledTransaction: { execute: (budgetId, accountId, scheduleId) => implementations.advanceScheduledTransaction(budgetId, accountId, scheduleId) },
    renameScheduledPayeeReferences: { execute: (budgetId, input) => implementations.renameScheduledPayeeReferences(budgetId, input) },
    reassignScheduledPayeeReferences: { execute: (budgetId, input) => implementations.reassignScheduledPayeeReferences(budgetId, input) },
  };
}

/** Public facade adapters deliberately discard internal completion metadata. */
export function createPublicOrdinaryCommandFacade(
  handlers: OrdinaryCommandHandlerRegistry,
): LocalBudgetEngine {
  return Object.fromEntries(LOCAL_BUDGET_COMMAND_METHODS.map((method) => [
    method,
    (...args: never[]) => handlers[method].execute(...args).then(({ result }) => result),
  ])) as LocalBudgetEngine;
}
