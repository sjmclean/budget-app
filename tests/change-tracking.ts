import { createDatabase } from "../packages/database/src/db.js";
import { ChangeOperation } from "../packages/types/src/ChangeOperation.js";
import { SqliteChangeRecordRepository } from "../packages/repository/src/SqliteChangeRecordRepository.js";
import { SqliteSyncStateRepository } from "../packages/repository/src/SqliteSyncStateRepository.js";
import { SyncApplicationService } from "../packages/application/src/SyncApplicationService.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();

  const db = createDatabase("Test.budget");
  const changeRepo = new SqliteChangeRecordRepository(db);
  const syncStateRepo = new SqliteSyncStateRepository(db);
  const service = new SyncApplicationService(changeRepo, syncStateRepo);

  await service.recordChange({
    budgetId: "budget",
    deviceId: "device",
    entityType: "Transaction",
    entityId: "tx-1",
    operation: ChangeOperation.Create,
  });

  await service.markSynced("budget", "device");

  console.log(await changeRepo.findByBudget("budget"));
  console.log(await syncStateRepo.getByBudgetAndDevice("budget", "device"));
}

main();
