import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import test from "node:test";

const root = resolve("apps/web/src");
const writeMethods = [
  "addTransaction", "commitTransactionBatch", "commitImportBatch", "moveTransactions",
  "updateTransaction", "deleteTransaction", "writeAccount", "deleteAccount", "writePayee",
  "mergePayees", "mutateCategory", "setCategoryAssignedValues",
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  }).filter((path) => [".ts", ".tsx"].includes(extname(path)));
}

test("query-only application code cannot invoke ordinary command methods", () => {
  const violations: string[] = [];
  for (const path of sourceFiles(root)) {
    const source = readFileSync(path, "utf8");
    for (const method of writeMethods) {
      if (new RegExp(`accountRegisterQueries[!?]?\\.${method}\\s*\\(`).test(source)) {
        violations.push(`${relative(root, path)}:${method}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test("feature and UI modules do not own mutation envelopes or persistence publication", () => {
  const violations: string[] = [];
  for (const path of sourceFiles(root)) {
    const local = relative(root, path).replaceAll("\\", "/");
    if (local.startsWith("features/persistence/localFirst/") ||
        local === "features/persistence/persistenceChangeBus.ts") continue;
    const source = readFileSync(path, "utf8");
    if (/\bLocalBudgetMutation\b/.test(source) ||
        /\bnotifyLocalFirstMutationCommitted\b/.test(source) ||
        /\bpublishPersistenceChange\b/.test(source)) {
      violations.push(local);
    }
  }
  assert.deepEqual(violations, []);
});

test("query contract excludes every command method", () => {
  const source = readFileSync(resolve(root, "features/persistence/accountRegisterQueryContracts.ts"), "utf8");
  assert.match(source, /LocalBudgetQueryClient = Omit<LocalBudgetRuntimeClient, LocalBudgetCommandMethod>/);
  assert.match(source, /LocalBudgetEngine = Pick<LocalBudgetRuntimeClient, LocalBudgetCommandMethod>/);
});

test("ordinary domain modules cannot import local persistence publication", () => {
  const violations: string[] = [];
  const allowed = new Set([
    "features/persistence/localFirst/engine/localBudgetCommandExecutor.ts",
    "features/persistence/localFirst/mutationEvents.ts",
  ]);
  for (const path of sourceFiles(resolve(root, "features/persistence/localFirst"))) {
    const local = relative(root, path).replaceAll("\\", "/");
    if (allowed.has(local)) continue;
    const source = readFileSync(path, "utf8");
    if (/import[^;]*\bnotifyLocalFirstMutationCommitted\b/.test(source) ||
        /\bpublishPersistenceChange\s*\(/.test(source)) {
      violations.push(local);
    }
  }
  assert.deepEqual(violations, []);
});

test("executor consumes explicit committed handler results", () => {
  const executor = readFileSync(resolve(root, "features/persistence/localFirst/engine/localBudgetCommandExecutor.ts"), "utf8");
  const handlers = readFileSync(resolve(root, "features/persistence/localFirst/engine/domainCommandHandlers.ts"), "utf8");
  assert.match(executor, /LocalBudgetDomainCommandHandler/);
  assert.match(executor, /await handler\.execute\(\)/);
  assert.doesNotMatch(executor, /recordChange|beginCommand|commitCommand|abortCommand/);
  assert.match(handlers, /Promise<CommittedCommandHandlerResult<T>>/);
});

test("all ordinary transaction implementations are engine-module owned", () => {
  const runtime = readFileSync(resolve(root, "features/persistence/localFirst/localFirstAccountRegisterClient.ts"), "utf8");
  const commands = readFileSync(resolve(root, "features/persistence/localFirst/engine/transactionCommands.ts"), "utf8");

  for (const method of [
    "addTransaction",
    "commitTransactionBatch",
    "moveTransactions",
    "updateTransaction",
    "toggleTransactionCleared",
    "setTransactionsCleared",
    "deleteTransaction",
  ]) {
    assert.match(runtime, new RegExp(`${method}: transactionCommands\\.${method}`));
    assert.doesNotMatch(runtime, new RegExp(`async ${method}\\s*\\(`));
    assert.match(commands, new RegExp(`async ${method}\\s*\\(`));
  }
  assert.match(commands, /local\.writeTransactionBatch\s*\(/);
  assert.match(commands, /local\.deleteTransaction\s*\(/);
  assert.match(commands, /local\.deleteTransactionBatch\s*\(/);
  const runtimeClient = runtime.slice(runtime.indexOf("  const client:"));
  assert.doesNotMatch(
    runtimeClient,
    /local\.(?:writeTransaction|writeTransactionBatch|deleteTransaction|deleteTransactionBatch)\s*\(/,
  );
  for (const helper of [
    "transactionRecord",
    "requireTransferCounterpart",
    "findReciprocalTransferCounterpartForDelete",
    "buildTransferPair",
    "buildNewTransactionRecords",
    "buildUpdatedTransactionRecords",
    "transactionWrite",
    "transactionWrites",
    "prepareTransactionBatchWrites",
  ]) {
    assert.doesNotMatch(runtime, new RegExp(`function ${helper}\\s*\\(`));
  }
  assert.doesNotMatch(commands, /readonly (buildNewTransactionRecords|buildUpdatedTransactionRecords|transactionWrites|requireMutableTransaction|findReciprocalTransferCounterpartForDelete):/);
});

test("all ordinary account implementations are engine-module owned", () => {
  const runtime = readFileSync(resolve(root, "features/persistence/localFirst/localFirstAccountRegisterClient.ts"), "utf8");
  const commands = readFileSync(resolve(root, "features/persistence/localFirst/engine/accountCommands.ts"), "utf8");
  for (const method of [
    "createAccount",
    "replaceAccountHistoryState",
    "updateAccount",
    "setAccountClosed",
    "deleteAccount",
  ]) {
    assert.match(runtime, new RegExp(`${method}: accountCommands\\.${method}`));
    assert.doesNotMatch(runtime, new RegExp(`async ${method}\\s*\\(`));
    assert.match(commands, new RegExp(`async ${method}\\s*\\(`));
  }
  const runtimeClient = runtime.slice(runtime.indexOf("  const client:"));
  assert.doesNotMatch(
    runtimeClient,
    /local\.(?:writeAccount|deleteAccount|replaceAccountHistoryState)\s*\(/,
  );
  assert.doesNotMatch(runtime, /function listLocalAccounts\s*\(/);
  assert.doesNotMatch(commands, /\bsynchronise\b/);
  assert.match(commands, /discardFailedMutation\(mutation\.mutationId\)/);
});

test("all ordinary budget and category implementations and helpers are engine-module owned", () => {
  const runtime = readFileSync(resolve(root, "features/persistence/localFirst/localFirstAccountRegisterClient.ts"), "utf8");
  const commands = readFileSync(resolve(root, "features/persistence/localFirst/engine/budgetCategoryCommands.ts"), "utf8");
  const helpers = readFileSync(resolve(root, "features/persistence/localFirst/engine/categoryCommandHelpers.ts"), "utf8");
  for (const method of [
    "setCategoryAssignedValues",
    "mutateCategory",
    "replaceBudgetMonthHistoryState",
  ]) {
    assert.match(runtime, new RegExp(`${method}: budgetCategoryCommands\\.${method}`));
    assert.doesNotMatch(runtime, new RegExp(`async ${method}\\s*\\(`));
    assert.match(commands, new RegExp(`async ${method}\\s*\\(`));
  }
  for (const helper of [
    "mutateBudgetCategory",
    "moveBudgetCategoryToTarget",
    "moveByDirection",
    "moveToTarget",
  ]) {
    assert.doesNotMatch(runtime, new RegExp(`function ${helper}\\s*\\(`));
  }
  assert.match(helpers, /function mutateBudgetCategory\s*\(/);
  assert.match(helpers, /function moveBudgetCategoryToTarget\s*</);
  const runtimeClient = runtime.slice(runtime.indexOf("  const client:"));
  assert.doesNotMatch(runtimeClient, /local\.(?:mergeCategories|replaceBudgetMonthHistoryState)\s*\(/);
  assert.doesNotMatch(runtimeClient, /local\.mutateBatch\s*\([^)]*budgetMonths/);
  assert.doesNotMatch(commands, /\bsynchronise\b/);
});

test("all ordinary Category Goal implementations are engine-module owned", () => {
  const runtime = readFileSync(resolve(root, "features/persistence/localFirst/localFirstAccountRegisterClient.ts"), "utf8");
  const commands = readFileSync(resolve(root, "features/persistence/localFirst/engine/categoryGoalCommands.ts"), "utf8");
  for (const method of [
    "createCategoryGoal",
    "updateCategoryGoal",
    "deleteCategoryGoal",
    "replaceCategoryGoalHistoryState",
  ]) {
    assert.match(runtime, new RegExp(`${method}: categoryGoalCommands\\.${method}`));
    assert.doesNotMatch(runtime, new RegExp(`async ${method}\\s*\\(`));
    assert.match(commands, new RegExp(`async ${method}\\s*\\(`));
  }
  const runtimeClient = runtime.slice(runtime.indexOf("  const client:"));
  assert.doesNotMatch(
    runtimeClient,
    /local\.(?:writeCategoryGoal|deleteCategoryGoal|replaceCategoryGoalHistoryState)\s*\(/,
  );
  assert.doesNotMatch(
    runtime,
    /commitCategoryGoalMutation|normaliseCategoryGoalForPersistence|categoryGoalsEqual/,
  );
  assert.doesNotMatch(commands, /\bsynchronise\b/);
  assert.match(commands, /discardFailedMutation\(mutation\.mutationId\)/);
});

test("all ordinary payee implementations are engine-module owned", () => {
  const runtime = readFileSync(resolve(root, "features/persistence/localFirst/localFirstAccountRegisterClient.ts"), "utf8");
  const commands = readFileSync(resolve(root, "features/persistence/localFirst/engine/payeeCommands.ts"), "utf8");
  for (const method of [
    "keepPayeesSeparate", "replacePayeeDuplicateSuppressionsHistoryState", "createPayee",
    "replacePayeeHistoryState", "updatePayee", "setPayeeArchived", "deleteUnusedPayee", "mergePayees",
  ]) {
    assert.match(runtime, new RegExp(`${method}: payeeCommands\\.${method}`));
    assert.doesNotMatch(runtime, new RegExp(`async ${method}\\s*\\(`));
    assert.match(commands, new RegExp(`async ${method}\\s*\\(`));
  }
  const runtimeClient = runtime.slice(runtime.indexOf("  const client:"));
  assert.doesNotMatch(runtimeClient, /local\.(?:writePayee|deleteUnusedPayee|mergePayees|keepPayeesSeparate|replacePayeeDuplicateSuppressionsHistoryState)\s*\(/);
  assert.doesNotMatch(commands, /\bsynchronise\b|notifyLocalFirstMutationCommitted|publishPersistenceChange/);
  assert.match(commands, /validatePayeeIconReferenceForWrite/);
});
