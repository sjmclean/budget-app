import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BudgetPackageManager } from "../packages/budget-file/src/index.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const root = mkdtempSync(join(tmpdir(), "budget-lock-"));
const packagePath = join(root, "Household.budget");
const manager = new BudgetPackageManager();
manager.create({ packagePath, name: "Household", currency: "AUD" });

const lock = manager.locks.acquire(packagePath, {
  deviceId: "desktop-001",
  appVersion: "1.2.1",
});
assert(lock.deviceId === "desktop-001", "Expected lock device id");
assert(manager.locks.isLocked(packagePath), "Expected package to be locked");

let blocked = false;
try {
  manager.locks.acquire(packagePath, {
    deviceId: "ipad-001",
    appVersion: "1.2.1",
  });
} catch {
  blocked = true;
}
assert(blocked, "Expected second lock acquisition to be blocked");

manager.locks.release(packagePath);
assert(!manager.locks.isLocked(packagePath), "Expected lock to be released");

console.log("PASS: v1.2.1 budget package locking");
