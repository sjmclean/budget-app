import Database from "better-sqlite3";
import { compareGranularity } from "../../tests/helpers/restorePointGranularity";

// Same 30,001-row, 8 KiB-page fixture as the shipped-worker integration test.
const database = new Database(":memory:");
try {
  database.pragma("page_size=8192");
  database.exec("CREATE TABLE transactions(id INTEGER PRIMARY KEY, memo TEXT)");
  const insert = database.prepare("INSERT INTO transactions VALUES (?, ?)");
  database.transaction(() => {
    for (let id = 1; id <= 30001; id++) insert.run(id, `Imported transaction ${id}`.padEnd(1100, "x"));
  })();
  const before = database.serialize();
  database.prepare("UPDATE transactions SET memo=? WHERE id=?").run("Small edited transaction".padEnd(1100, "y"), 15000);
  console.log(JSON.stringify(await compareGranularity(before, database.serialize()), null, 2));
} finally { database.close(); }
