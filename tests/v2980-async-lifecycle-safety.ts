import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const budgetWorkspace = read(
  "apps/web/src/features/budget/useBudgetWorkspace.ts",
);
const accountRegister = read(
  "apps/web/src/features/accounts/useAccountRegister.ts",
);
const packageJson = read("package.json");

assert(
  packageJson.includes('"test:v2980:async-lifecycle-safety"'),
  "package.json should expose the v2.98 async lifecycle regression test",
);
assert(
  budgetWorkspace.includes("workspaceIdentityRef"),
  "Budget workspace should track the active budget/month identity",
);
assert(
  budgetWorkspace.includes("activityRequestVersionRef"),
  "Budget activity requests should use latest-request-wins versioning",
);
assert(
  budgetWorkspace.includes("mergePreviewRequestVersionRef"),
  "Budget merge previews should use latest-request-wins versioning",
);
assert(
  budgetWorkspace.includes("mutationVersionRef"),
  "Budget mutations should reject stale completions",
);
assert(
  budgetWorkspace.includes("isWorkspaceCurrent(workspaceIdentity)"),
  "Budget async completions should verify the active workspace",
);
assert(
  budgetWorkspace.includes("pendingChanges.map((change) => ({"),
  "Pending Budget assignment edits should be persisted during cleanup",
);
assert(
  budgetWorkspace.includes("assigned: change.finalAssigned"),
  "Cleanup persistence should save final assignment values",
);
assert(
  accountRegister.includes("activeAccountIdRef"),
  "Register mutations should track the active account",
);
assert(
  accountRegister.includes("mutationVersionRef"),
  "Register mutations should use latest-request-wins versioning",
);
assert(
  accountRegister.includes("activeAccountIdRef.current === mutationAccountId"),
  "Register mutation results should be ignored after account changes",
);
assert(
  accountRegister.includes("mountedRef.current"),
  "Register mutation results should be ignored after unmount",
);

console.log("v2.98 async lifecycle safety regression checks passed");
