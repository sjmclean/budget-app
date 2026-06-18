import { createDatabase } from "../packages/database/src/db.js";
import { createCloudStorageSettings } from "../packages/budget-engine/src/services/createCloudStorageSettings.js";
import { SyncProvider } from "../packages/types/src/SyncProvider.js";
import { SqliteCloudStorageSettingsRepository } from "../packages/repository/src/SqliteCloudStorageSettingsRepository.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");
  const repo = new SqliteCloudStorageSettingsRepository(db);

  const local = createCloudStorageSettings({
    userId: "user",
    deviceId: "device",
    provider: SyncProvider.LocalFolder,
    syncRootPath: "/Users/Stewart/Dropbox/BudgetApp",
  });

  const dropboxFuture = createCloudStorageSettings({
    userId: "user",
    provider: SyncProvider.Dropbox,
    syncRootPath: "/BudgetApp",
  });

  await repo.create(local);
  await repo.create(dropboxFuture);

  console.log(await repo.findByUserId("user"));
}

main();
