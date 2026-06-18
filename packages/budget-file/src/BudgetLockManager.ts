import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BudgetPackageLock } from "./BudgetPackageTypes.js";

export interface LockStatus {
  locked: boolean;
  stale: boolean;
  lock?: BudgetPackageLock;
}

export class BudgetLockManager {
  private path(packagePath: string): string {
    return join(packagePath, "budget.lock");
  }

  isLocked(packagePath: string): boolean {
    return existsSync(this.path(packagePath));
  }

  inspect(packagePath: string, staleAfterMinutes = 60): LockStatus {
    const lock = this.readLock(packagePath);
    if (!lock) return { locked: false, stale: false };
    const ageMs = Date.now() - new Date(lock.openedAt).getTime();
    return { locked: true, stale: ageMs > staleAfterMinutes * 60_000, lock };
  }

  heartbeat(packagePath: string, deviceId: string): BudgetPackageLock {
    const existing = this.readLock(packagePath);
    if (!existing) throw new Error("Cannot heartbeat an unlocked budget package");
    if (existing.deviceId !== deviceId) throw new Error(`Budget package is locked by ${existing.deviceId}, not ${deviceId}`);
    const lock = { ...existing, openedAt: new Date().toISOString() };
    writeFileSync(this.path(packagePath), JSON.stringify(lock, null, 2));
    return lock;
  }

  readLock(packagePath: string): BudgetPackageLock | undefined {
    if (!this.isLocked(packagePath)) return undefined;
    return JSON.parse(readFileSync(this.path(packagePath), "utf8")) as BudgetPackageLock;
  }

  acquire(packagePath: string, input: Omit<BudgetPackageLock, "openedAt"> & { force?: boolean }): BudgetPackageLock {
    if (this.isLocked(packagePath) && input.force !== true) {
      const lock = this.readLock(packagePath);
      throw new Error(`Budget package is already locked by ${lock?.deviceId ?? "another device"}`);
    }
    const lock: BudgetPackageLock = {
      deviceId: input.deviceId,
      appVersion: input.appVersion,
      openedAt: new Date().toISOString(),
    };
    writeFileSync(this.path(packagePath), JSON.stringify(lock, null, 2));
    return lock;
  }

  release(packagePath: string): void {
    if (this.isLocked(packagePath)) unlinkSync(this.path(packagePath));
  }
}
