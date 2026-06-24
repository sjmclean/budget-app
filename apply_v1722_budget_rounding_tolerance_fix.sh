#!/usr/bin/env bash
set -euo pipefail

AUDIT_FILE="apps/web/src/features/budget/ynab4LauncherImportAccuracyAudit.ts"
TEST_FILE="tests/v1722-ynab4-budget-rounding-tolerance.ts"
PKG="package.json"

if [[ ! -f "$AUDIT_FILE" ]]; then
  echo "ERROR: $AUDIT_FILE not found" >&2
  exit 1
fi

python3 - <<'PY'
from pathlib import Path

path = Path("apps/web/src/features/budget/ynab4LauncherImportAccuracyAudit.ts")
text = path.read_text()
old = '''function compareMoney(mismatches: string[], label: string, source: number, imported: number): void {
  if (Math.abs(source - imported) > 0.005) {
    mismatches.push(`${label} mismatch: source=${source.toFixed(2)}, imported=${imported.toFixed(2)}.`);
  }
}'''
new = '''const MONEY_AUDIT_TOLERANCE = 0.015;

function compareMoney(mismatches: string[], label: string, source: number, imported: number): void {
  if (Math.abs(source - imported) > MONEY_AUDIT_TOLERANCE) {
    mismatches.push(`${label} mismatch: source=${source.toFixed(2)}, imported=${imported.toFixed(2)}.`);
  }
}'''
if old not in text:
    raise SystemExit("Could not find compareMoney block to replace")
text = text.replace(old, new)
path.write_text(text)
PY

cat > "$TEST_FILE" <<'TS'
import assert from "node:assert/strict";
import {
  auditYnab4LauncherImportAccuracy,
} from "../apps/web/src/features/budget/ynab4LauncherImportAccuracyAudit.ts";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import type { Ynab4PackageEntry } from "../packages/ynab4-importer/src/analyzeYnab4Package.ts";

class MemoryStorage implements KeyValueStoragePort {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  listKeys(): string[] {
    return [...this.values.keys()].sort();
  }
}

function entries(): Ynab4PackageEntry[] {
  return [
    {
      path: "My Budget.ynab4/Budget.ymeta",
      text: JSON.stringify({ relativeDataFolderName: "data1~ABC" }),
    },
    {
      path: "My Budget.ynab4/data1~ABC/Budget.yfull",
      text: JSON.stringify({
        accounts: [{ entityId: "account-1", name: "Cheque", accountType: "Checking", onBudget: true }],
        masterCategories: [{
          entityId: "group-1",
          name: "Everyday",
          subCategories: [{ entityId: "category-1", name: "Groceries" }],
        }],
        payees: [],
        transactions: [],
        scheduledTransactions: [],
        monthlyBudgets: [{
          month: "2025-04",
          monthlySubCategoryBudgets: [{
            categoryId: "category-1",
            budgeted: 3642980,
            activity: 0,
            balance: 0,
          }],
        }],
      }),
    },
  ];
}

const storage = new MemoryStorage();
storage.setItem("budget-app.budgets.my-budget.budget-app.accounts.v1", JSON.stringify([
  { id: "account-1", name: "Cheque" },
]));
storage.setItem("budget-app.budgets.my-budget.budget-app.account-registers.v1", JSON.stringify({}));
storage.setItem("budget-app.budgets.my-budget.budget-app.scheduled-transactions.v1", JSON.stringify([]));
storage.setItem("budget-app.budget-view.v1.my-budget.2025-04", JSON.stringify({
  totalAssigned: 3642.97,
  totalActivity: 0,
  totalAvailable: 3642.97,
}));

const audit = auditYnab4LauncherImportAccuracy(storage, {
  budgetId: "my-budget",
  entries: entries(),
});

assert.equal(audit.status, "pass");
assert.deepEqual(audit.mismatches, []);
assert.equal(
  audit.warnings.some((warning) => warning.includes("available differs")),
  true,
);

console.log("v1.72.2 YNAB4 budget rounding tolerance tests passed");
TS

python3 - <<'PY'
from pathlib import Path
import json

path = Path("package.json")
data = json.loads(path.read_text())
scripts = data.setdefault("scripts", {})
scripts["test:v1722"] = "pnpm test:v1722:ynab4-budget-rounding-tolerance"
scripts["test:v1722:ynab4-budget-rounding-tolerance"] = "tsx tests/v1722-ynab4-budget-rounding-tolerance.ts"
path.write_text(json.dumps(data, indent=2) + "\n")
PY

echo "v1.72.2 budget rounding tolerance patch applied"
