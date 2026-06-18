import { createChangeRecord } from "../packages/budget-engine/src/services/createChangeRecord.js";
import { planSync } from "../packages/budget-engine/src/services/planSync.js";
import { ChangeOperation } from "../packages/types/src/ChangeOperation.js";

const local = [
  createChangeRecord({
    budgetId: "budget",
    deviceId: "pc",
    entityType: "Transaction",
    entityId: "tx-1",
    operation: ChangeOperation.Update
  })
];

const remote = [
  createChangeRecord({
    budgetId: "budget",
    deviceId: "ipad",
    entityType: "Transaction",
    entityId: "tx-1",
    operation: ChangeOperation.Delete
  })
];

console.log(planSync(local, remote));
