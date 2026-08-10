import assert from "node:assert/strict";
import { installInMemoryBudgetPersistence } from "./support/persistence/inMemoryBudgetPersistence.js";

const { storage, cleanup } = installInMemoryBudgetPersistence();

const {
  deleteTransactionImportSession,
  readTransactionImportSession,
  writeTransactionImportSession,
} = await import("../apps/web/src/features/accounts/transactionImportSession.ts");
const {
  createTransactionImportSessionEntityRepository,
  TRANSACTION_IMPORT_SESSION_ENTITY_INDEX_KEY,
  TRANSACTION_IMPORT_SESSION_ENTITY_RECORD_PREFIX,
} = await import("../apps/web/src/features/accounts/entities/importSessionEntity.ts");
const {
  BUDGET_REGISTRY_STORAGE_KEY,
  createInitialBudgetRegistry,
} = await import("../apps/web/src/features/budget/budgetRegistry.ts");
const {
  SELECTED_BUDGET_STORAGE_KEY,
  createFixedBudgetScopedStorage,
  getBudgetScopedStorageKey,
} = await import("../apps/web/src/features/budget/budgetDataScope.ts");

try {
  const household = createInitialBudgetRegistry(new Date("2026-07-18T00:00:00.000Z"))[0]!;
  const second = { ...household, id: "travel", name: "Travel", packagePath: "~/Budgets/Travel.budget" };
  storage.setItem(BUDGET_REGISTRY_STORAGE_KEY, JSON.stringify([household, second]));
  storage.setItem(SELECTED_BUDGET_STORAGE_KEY, household.id);

  const snapshot = {
    version: 1 as const,
    accountId: "checking",
    savedAt: "2026-07-18T00:00:00.000Z",
    fileName: "statement.qif",
    fileType: "qif" as const,
    fileHash: "hash",
    csvText: null,
    qifText: "!Type:Bank\n^",
    ofxText: null,
    ofxInspection: null,
    qifDetection: null,
    qifDateFormat: "DD/MM/YY" as const,
    qifAmountFormat: "decimal-dot" as const,
    analysis: null,
    mapping: {},
    preview: { summary: { totalRows: 1, invalidRows: 0, exactMatches: 0, possibleMatches: 0, newTransactions: 1, selectedForImport: 1 }, candidates: [] },
    candidates: [],
    bankCandidateDetails: {},
    processedCandidates: [],
    matchEditorOrigins: {},
    matchedTransactionOrigins: {},
    previouslyImportedCount: 0,
    alreadyRepresentedCount: 0,
    excludeMemos: false,
    updateMatchedTransactionDates: true,
  };

  assert.equal(writeTransactionImportSession(snapshot), true);
  assert.deepEqual(readTransactionImportSession("checking"), snapshot);
  assert.equal(readTransactionImportSession("savings"), null);
  assert.equal(storage.getItem("budget-app.transaction-import-session.v1.checking"), null);
  assert.equal(
    storage.getItem(getBudgetScopedStorageKey(household.id, "budget-app.transaction-import-session.v1.checking")),
    null,
  );

  const householdStorage = createFixedBudgetScopedStorage(storage, household.id);
  const householdRepository = createTransactionImportSessionEntityRepository(householdStorage);
  assert.deepEqual(JSON.parse(householdStorage.getItem(TRANSACTION_IMPORT_SESSION_ENTITY_INDEX_KEY) ?? "[]"), ["checking"]);
  assert.ok(householdStorage.listKeys().some((key) => key === `${TRANSACTION_IMPORT_SESSION_ENTITY_RECORD_PREFIX}checking`));
  assert.equal(householdRepository.get("checking")?.metadata.tombstone, null);

  storage.setItem(SELECTED_BUDGET_STORAGE_KEY, second.id);
  assert.equal(readTransactionImportSession("checking"), null);
  assert.equal(writeTransactionImportSession({ ...snapshot, savedAt: "2026-07-19T00:00:00.000Z", fileName: "travel.qif" }), true);
  assert.equal(readTransactionImportSession("checking")?.fileName, "travel.qif");

  storage.setItem(SELECTED_BUDGET_STORAGE_KEY, household.id);
  assert.equal(readTransactionImportSession("checking")?.fileName, "statement.qif");
  deleteTransactionImportSession("checking");
  assert.equal(readTransactionImportSession("checking"), null);
  assert.notEqual(householdRepository.get("checking")?.metadata.tombstone, null);

  assert.equal(writeTransactionImportSession({ ...snapshot, savedAt: "2026-07-20T00:00:00.000Z" }), true);
  assert.equal(readTransactionImportSession("checking")?.savedAt, "2026-07-20T00:00:00.000Z");
  assert.equal(householdRepository.get("checking")?.metadata.tombstone, null);

  console.log("v3.22.3 persistent import session entity tests passed");
} finally {
  cleanup();
}
