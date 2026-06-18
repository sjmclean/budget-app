import {
  BudgetCreator,
  type CreateBudgetPackageInput,
} from "./BudgetCreator.js";
import { BudgetLockManager } from "./BudgetLockManager.js";
import { BudgetOpener } from "./BudgetOpener.js";
import { AttachmentManager } from "./AttachmentManager.js";
import { BackupManager } from "./BackupManager.js";
import { RestoreManager } from "./RestoreManager.js";

export class BudgetPackageManager {
  readonly creator = new BudgetCreator();
  readonly opener = new BudgetOpener();
  readonly locks = new BudgetLockManager();
  readonly attachments = new AttachmentManager();
  readonly backups = new BackupManager();
  readonly restore = new RestoreManager();

  create(input: CreateBudgetPackageInput) {
    return this.creator.create(input);
  }

  open(packagePath: string) {
    return this.opener.open(packagePath);
  }

  validate(packagePath: string) {
    return this.opener.validate(packagePath);
  }
}
