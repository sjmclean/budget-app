import { ForeignKeyMigrationPlanApplicationService } from "../packages/application/src/ForeignKeyMigrationPlanApplicationService.js";

const plan = new ForeignKeyMigrationPlanApplicationService().getPlan();
if (plan.length < 8)
  throw new Error("Expected a meaningful foreign-key migration plan");
if (
  !plan.some(
    (step) =>
      step.table === "transactions" && step.references.includes("accounts"),
  )
) {
  throw new Error(
    "Expected transactions FK plan to include account references",
  );
}
if (!plan.every((step) => step.action.includes("rebuild"))) {
  throw new Error("Expected SQLite FK plan to use safe table rebuild steps");
}

console.log("v1.2.14 foreign-key migration plan OK");
