import { createDatabase } from "../packages/database/src/db.js";
import { SqliteDeviceRepository } from "../packages/repository/src/SqliteDeviceRepository.js";
import { DeviceApplicationService } from "../packages/application/src/DeviceApplicationService.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();

  const db = createDatabase("Test.budget");
  const repo = new SqliteDeviceRepository(db);
  const service = new DeviceApplicationService(repo);

  const device = await service.registerDevice("user-1", "Stewart PC");
  console.log(device);

  console.log(await service.markSeen(device.id));
  console.log(await service.listUserDevices("user-1"));
}

main();
