import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");

assert.equal(existsSync(`${root}/packages/types/src/TransactionFlag.ts`), false);
assert.equal(existsSync(`${root}/packages/repository/src/TransactionFlagRepository.ts`), false);
assert.equal(existsSync(`${root}/packages/repository/src/SqliteTransactionFlagRepository.ts`), false);

const typesIndex = read("packages/types/src/index.ts");
const repositoryIndex = read("packages/repository/src/index.ts");
const metadataService = read("packages/application/src/TransactionMetadataApplicationService.ts");
const metadataFactory = read("packages/budget-engine/src/services/createTransactionMetadata.ts");
const accountRegister = read("packages/application/src/AccountRegisterApplicationService.ts");
const indexedSearch = read("packages/application/src/IndexedTransactionSearchApplicationService.ts");
const bulkTransactions = read("packages/application/src/BulkTransactionApplicationService.ts");
const ynabImport = read("packages/ynab4-importer/src/Ynab4DatabaseImportService.ts");

assert.doesNotMatch(typesIndex, /TransactionFlag/);
assert.doesNotMatch(repositoryIndex, /TransactionFlagRepository|SqliteTransactionFlagRepository/);
assert.doesNotMatch(metadataService, /setFlag|getFlags|clearFlag|flagRepo|TransactionFlag/);
assert.doesNotMatch(metadataFactory, /createTransactionFlag|TransactionFlag/);
assert.doesNotMatch(accountRegister, /RegisterTransactionFlag|\bflag:/);
assert.doesNotMatch(indexedSearch, /flagColour|transaction_flags/);
assert.doesNotMatch(bulkTransactions, /flagColour/);
assert.doesNotMatch(ynabImport, /TransactionFlagColour|transactionFlags|mapFlagColour/);

const schema = read("packages/database/src/schema.ts");
assert.match(schema, /sqliteTable\("transaction_flags"/, "legacy table remains for database compatibility");

console.log("v2.93.7 obsolete package flag subsystem removal checks passed");
