import { createDatabase } from "../packages/database/src/db.js";
import { SqliteUserRepository } from "../packages/repository/src/SqliteUserRepository.js";
import { SqliteSessionRepository } from "../packages/repository/src/SqliteSessionRepository.js";
import { SqliteUserSettingsRepository } from "../packages/repository/src/SqliteUserSettingsRepository.js";
import { AuthApplicationService } from "../packages/application/src/AuthApplicationService.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");

  const auth = new AuthApplicationService(
    new SqliteUserRepository(db),
    new SqliteSessionRepository(db),
    new SqliteUserSettingsRepository(db),
  );

  await auth.signUp("Stewart", null, "password123");
  const session = await auth.login("Stewart", "password123");

  console.log(session);
  console.log(await auth.getSession(session.id));

  await auth.logout(session.id);

  console.log(await auth.getSession(session.id));
}

main();
