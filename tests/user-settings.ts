import { createDatabase } from "../packages/database/src/db.js";
import { SqliteUserRepository } from "../packages/repository/src/SqliteUserRepository.js";
import { SqliteSessionRepository } from "../packages/repository/src/SqliteSessionRepository.js";
import { SqliteUserSettingsRepository } from "../packages/repository/src/SqliteUserSettingsRepository.js";
import { AuthApplicationService } from "../packages/application/src/AuthApplicationService.js";
import { UserSettingsApplicationService } from "../packages/application/src/UserSettingsApplicationService.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");

  const settingsRepo = new SqliteUserSettingsRepository(db);

  const auth = new AuthApplicationService(
    new SqliteUserRepository(db),
    new SqliteSessionRepository(db),
    settingsRepo
  );

  const settingsService = new UserSettingsApplicationService(settingsRepo);

  const user = await auth.signUp("Stewart", null, "password123");
  const settings = await settingsService.get(user.id);

  if (!settings) throw new Error("Settings missing");

  console.log(settings);

  console.log(
    await settingsService.update({
      ...settings,
      theme: "dark",
      sidebarCollapsed: true
    })
  );
}

main();
