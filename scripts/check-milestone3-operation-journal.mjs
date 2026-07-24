import { readFile } from "node:fs/promises";

const required = new Map([
  ["apps/web/src/features/persistence/operationJournal.ts", [
    "OPERATION_JOURNAL_FORMAT_VERSION",
    'type: "key-value.set"',
    'type: "key-value.remove"',
    "OperationJournalPort",
  ]],
  ["apps/web/src/features/persistence/localDatabaseKeyValueStorage.ts", [
    'const DATABASE_VERSION = 2',
    'const JOURNAL_STORE = "operation-journal"',
    "commitRecordAndJournal",
    "getJournalCursor",
    "readJournal",
    "db.transaction([RECORD_STORE, JOURNAL_STORE, META_STORE]",
  ]],
  ["apps/web/src/features/persistence/localDatabasePersistenceProvider.ts", [
    "operationJournal: storage",
  ]],
  ["docs/architecture/operation-journal.md", [
    "A local record mutation and its operation journal entry are committed",
  ]],
]);

const failures = [];
for (const [path, needles] of required) {
  const source = await readFile(path, "utf8");
  for (const needle of needles) {
    if (!source.includes(needle)) failures.push(`${path}: missing ${needle}`);
  }
}

if (failures.length) {
  console.error("Milestone 3 operation journal validation failed:\n" + failures.map((x) => `- ${x}`).join("\n"));
  process.exit(1);
}
console.log("Milestone 3 operation journal validation passed.");
