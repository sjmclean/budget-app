import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../packages/database/src/db.js";
import { PersistentPayeeRuleApplicationService } from "../packages/application/src/PersistentPayeeRuleApplicationService.js";
import { SqlitePayeeRuleRepository } from "../packages/repository/src/SqlitePayeeRuleRepository.js";
import type { PayeeRule } from "../packages/types/src/index.js";

const db = createDatabase(join(mkdtempSync(join(tmpdir(), "v1214-rules-")), "rules.sqlite"));
const rules = new PersistentPayeeRuleApplicationService(new SqlitePayeeRuleRepository(db));

const baseRule: PayeeRule = {
  id: "rule-woolies",
  budgetId: "budget-1",
  name: "Woolworths",
  pattern: "WOOLWORTHS",
  matchMode: "contains",
  payeeName: "Woolworths",
  categoryId: "cat-groceries",
  memo: null,
  priority: 100,
  isEnabled: true
};

await rules.create(baseRule);
await rules.create({ ...baseRule, id: "rule-woolies-duplicate", name: "Woolworths duplicate" });

const loaded = await rules.list("budget-1");
if (loaded.length !== 2) throw new Error("Expected persisted payee rules to round-trip");
if (loaded[0].priority !== 100) throw new Error("Expected rules to be priority ordered");

const conflicts = await rules.detectConflicts("budget-1");
if (conflicts.length !== 1) throw new Error("Expected same-pattern same-priority rule conflict");

await rules.update({ ...baseRule, pattern: "WOOLIES", priority: 50 });
const enabled = await rules.listEnabled("budget-1");
if (!enabled.some((rule) => rule.pattern === "WOOLIES")) throw new Error("Expected updated rule to persist");

await rules.delete("rule-woolies-duplicate");
if ((await rules.list("budget-1")).length !== 1) throw new Error("Expected deleted rule to be removed");

console.log("v1.2.14 persisted payee rules OK");
