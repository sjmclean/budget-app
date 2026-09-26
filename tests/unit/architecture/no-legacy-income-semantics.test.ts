import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const sourceRoots = [
  resolve(root, "apps"),
  resolve(root, "packages"),
];
const supportedExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", "dist", "build"].includes(entry.name)) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? walk(path)
      : supportedExtensions.has(extname(entry.name))
        ? [path]
        : [];
  });
}

test("runtime source contains no legacy Ready to Assign pseudo-category", () => {
  const violations = sourceRoots
    .flatMap(walk)
    .filter((path) => readFileSync(path, "utf8").includes("__ready_to_assign__"))
    .map((path) => relative(root, path).replaceAll("\\", "/"));

  assert.deepEqual(
    violations,
    [],
    `Legacy Ready to Assign pseudo-category found in runtime source: ${violations.join(", ")}`,
  );
});

test("runtime source contains no arbitrary-future income month APIs", () => {
  const legacySymbols = [
    "latestAllowedIncomeBudgetMonth",
    "incomeBudgetMonthOptions",
  ];

  const violations = sourceRoots
    .flatMap(walk)
    .flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return legacySymbols
        .filter((symbol) => source.includes(symbol))
        .map((symbol) =>
          `${relative(root, path).replaceAll("\\", "/")}: ${symbol}`,
        );
    });

  assert.deepEqual(
    violations,
    [],
    `Arbitrary-future income API found in runtime source: ${violations.join(", ")}`,
  );
});


test("runtime source contains no pre-canonical ready-to-budget income model", () => {
  const legacySymbols = [
    "readyToBudget",
    "ready_to_budget",
    "ReadyToBudget",
    "BufferFund",
    "calculateReadyToBudget",
    "addIncomeToBudgetMonth",
    "postIncomeToReadyToBudget",
  ];

  const violations = sourceRoots
    .flatMap(walk)
    .flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return legacySymbols
        .filter((symbol) => source.includes(symbol))
        .map((symbol) =>
          `${relative(root, path).replaceAll("\\", "/")}: ${symbol}`,
        );
    });

  assert.deepEqual(
    violations,
    [],
    `Pre-canonical Ready to Budget model found in runtime source: ${violations.join(", ")}`,
  );
});


test("obsolete parallel budget-income service files stay removed", () => {
  const legacyPaths = [
    "packages/application/src/BudgetApplicationService.ts",
    "packages/application/src/TransactionApplicationService.ts",
    "packages/budget-engine/src/calculations/calculateReadyToBudget.ts",
    "packages/budget-engine/src/calculations/calculateReadyToAssign.ts",
    "packages/budget-engine/src/services/addIncomeToBudgetMonth.ts",
    "packages/budget-engine/src/services/addIncomeForBudgetMonth.ts",
    "packages/budget-engine/src/services/createBudgetMonth.ts",
    "packages/budget-engine/src/services/assignToCategoryMonth.ts",
    "packages/budget-engine/src/services/rolloverBudgetMonth.ts",
    "packages/budget-engine/src/services/leaveOverspent.ts",
    "packages/budget-engine/src/services/budgetEngineScenario.ts",
    "packages/types/src/InflowDestination.ts",
  ];

  const violations = legacyPaths.filter((path) =>
    existsSync(resolve(root, path)),
  );

  assert.deepEqual(
    violations,
    [],
    `Obsolete parallel budget-income service files found: ${violations.join(", ")}`,
  );
});
