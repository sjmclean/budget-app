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

  const stewart = await auth.signUp(
    "Stewart",
    "stewart@example.com",
    "password123",
  );
  const daughter = await auth.signUp(
    "Daughter",
    "daughter@example.com",
    "password456",
  );

  console.log(stewart.displayName, daughter.displayName);
}

main();
