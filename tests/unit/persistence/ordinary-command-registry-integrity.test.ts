import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  LOCAL_BUDGET_COMMAND_METHODS,
  type LocalBudgetEngine,
} from "../../../apps/web/src/features/persistence/accountRegisterQueryContracts.js";

const registrySource = readFileSync(
  "apps/web/src/features/persistence/localFirst/engine/ordinaryCommandRegistry.ts",
  "utf8",
);
const runtimeSource = readFileSync(
  "apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts",
  "utf8",
);

test("the internal registry exactly covers the 45 authoritative ordinary commands", () => {
  const registered = [...registrySource.matchAll(/^    (\w+): \{ execute:/gm)]
    .map((match) => match[1]);

  assert.equal(LOCAL_BUDGET_COMMAND_METHODS.length, 45);
  assert.equal(registered.length, LOCAL_BUDGET_COMMAND_METHODS.length);
  assert.equal(new Set(registered).size, registered.length);
  assert.deepEqual(
    [...registered].sort(),
    [...LOCAL_BUDGET_COMMAND_METHODS].sort(),
  );
});

test("queries and conflict recovery are excluded from ordinary handlers", () => {
  for (const excluded of [
    "getBudgetStatus",
    "getAccountRegisterBootstrap",
    "getBudgetMonthView",
    "listPayees",
    "listTransactionTags",
    "listScheduledTransactions",
    "resolveSyncConflict",
  ]) {
    assert.doesNotMatch(
      registrySource,
      new RegExp(`^    ${excluded}: \\{ execute:`, "m"),
    );
  }
});

test("public facade dispatches through distinct internal handler objects", () => {
  assert.match(registrySource, /execute: \([^)]*\) => implementations\./);
  assert.match(
    runtimeSource,
    /const ordinaryCommandHandlers = createOrdinaryCommandHandlerRegistry\(client\)/,
  );
  assert.match(runtimeSource, /const handler = ordinaryCommandHandlers\[key\]/);
  assert.match(runtimeSource, /Reflect\.apply\(handler\.execute, handler, args\)/);
  assert.doesNotMatch(runtimeSource, /LOCAL_BUDGET_COMMAND_METHODS/);
  assert.match(
    runtimeSource,
    /key === "resolveSyncConflict" && args\[2\] === "keep-local"/,
  );
  assert.match(runtimeSource, /const invokeRecovery = \(\) => ownership\.run/);
  assert.doesNotMatch(registrySource, /resolveSyncConflict: \{ execute:/);
});

test("representative public methods retain domain-result return types", () => {
  type AwaitedReturn<Key extends keyof LocalBudgetEngine> =
    NonNullable<LocalBudgetEngine[Key]> extends (...args: never[]) => infer Result
      ? Awaited<Result>
      : never;
  type Expect<Condition extends true> = Condition;
  type Equal<Left, Right> =
    (<Value>() => Value extends Left ? 1 : 2) extends
    (<Value>() => Value extends Right ? 1 : 2) ? true : false;

  const assertions: [
    Expect<Equal<AwaitedReturn<"addTransaction">, void>>,
    Expect<Equal<AwaitedReturn<"setCategoryAssignedValues">, import("../../../apps/web/src/features/budget/budgetViewTypes.js").BudgetMonthView>>,
    Expect<Equal<AwaitedReturn<"createPayee">, readonly import("../../../apps/web/src/features/accounts/accountService.js").PayeeView[]>>,
    Expect<Equal<AwaitedReturn<"createScheduledTransaction">, readonly import("../../../apps/web/src/features/accounts/scheduledTransactionTypes.js").ScheduledTransactionView[]>>,
  ] = [true, true, true, true];

  assert.deepEqual(assertions, [true, true, true, true]);
});

test("all nine extracted command families are represented", () => {
  const families = [
    ["addTransaction", "commitImportBatch"],
    ["restoreTransactionHistorySnapshot", "replaceImportHistorySnapshot"],
    ["addTransactionAttachment", "removeTransactionAttachment"],
    ["createAccount", "deleteAccount"],
    ["setCategoryAssignedValues", "mutateCategory"],
    ["createCategoryGoal", "deleteCategoryGoal"],
    ["createPayee", "mergePayees"],
    ["replaceTransactionTags", "replaceTransactionTagsHistoryState"],
    ["createScheduledTransaction", "enterScheduledTransaction"],
  ];
  for (const family of families) {
    assert.ok(family.every((command) => registrySource.includes(`${command}: { execute:`)));
  }
});
