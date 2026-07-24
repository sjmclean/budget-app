import { readFile } from "node:fs/promises";

const files = {
  lifecycle: "apps/web/src/features/persistence/persistenceProviderLifecycle.ts",
  engine: "apps/web/src/features/persistence/replicationEngine.ts",
  bus: "apps/web/src/features/persistence/persistenceChangeBus.ts",
  register: "apps/web/src/features/accounts/useAccountRegister.ts",
  budget: "apps/web/src/features/budget/useBudgetView.ts",
};
const text = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")])));
const failures = [];
if (text.lifecycle.includes("window.location.reload()")) failures.push("ordinary persistence lifecycle still reloads the page");
if (!text.lifecycle.includes('source: "shared-server"')) failures.push("shared-server changes are not published to the reactive bus");
if (!text.engine.includes('source: "replication"')) failures.push("replication changes are not published to the reactive bus");
if (!text.bus.includes("useSyncExternalStore")) failures.push("reactive persistence bus does not use React external-store subscriptions");
if (!text.register.includes("usePersistenceChangeVersion")) failures.push("account register does not subscribe to persistence changes");
if (!text.budget.includes("usePersistenceChangeVersion")) failures.push("budget view does not subscribe to persistence changes");
if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Milestone 12 reactive persistence validation passed.");
