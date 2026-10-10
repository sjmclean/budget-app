import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workerSource = fs.readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);

const schemaSource = fs.readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/registerSchema.ts",
    import.meta.url,
  ),
  "utf8",
);

const transactionIndexes = [
  "local_transactions_register",
  "local_transactions_account_summary",
  "local_transactions_category_month",
  "local_transactions_budget_date",
  "local_transactions_budget_month",
  "local_transactions_payee",
] as const;

function functionBody(
  source: string,
  name: string,
  nextName: string,
): string {
  const start = source.indexOf(
    `function ${name}(`,
  );

  assert.notEqual(
    start,
    -1,
    `${name} should exist`,
  );

  const end = source.indexOf(
    `\nfunction ${nextName}(`,
    start,
  );

  assert.notEqual(
    end,
    -1,
    `${nextName} should follow ${name}`,
  );

  return source.slice(start, end);
}

test("register schema retains all transaction read indexes", () => {
  for (const indexName of transactionIndexes) {
    assert.match(
      schemaSource,
      new RegExp(
        `CREATE INDEX IF NOT EXISTS ${indexName}`,
      ),
      `final register schema must retain ${indexName}`,
    );
  }
});

test("fresh staged imports omit transaction secondary indexes", () => {
  assert.match(
    schemaSource,
    /export const LOCAL_REGISTER_BASE_SCHEMA_SQL/,
    "register schema should expose a base schema for staging",
  );
  assert.match(
    schemaSource,
    /export const LOCAL_TRANSACTION_READ_INDEX_SQL/,
    "register schema should expose the deferred transaction indexes",
  );

  const baseStart = schemaSource.indexOf("export const LOCAL_REGISTER_BASE_SCHEMA_SQL");
  const indexStart = schemaSource.indexOf("export const LOCAL_TRANSACTION_READ_INDEX_SQL");
  const baseSchema = schemaSource.slice(baseStart, indexStart);

  for (const indexName of transactionIndexes) {
    assert.doesNotMatch(
      baseSchema,
      new RegExp(`CREATE INDEX IF NOT EXISTS ${indexName}`),
      `staging base schema must not create ${indexName}`,
    );
    assert.match(
      schemaSource.slice(indexStart),
      new RegExp(`CREATE INDEX IF NOT EXISTS ${indexName}`),
      `final schema must retain ${indexName}`,
    );
  }
});

test("index deferral is applied only after staged schema creation", () => {
  const start = workerSource.indexOf(
    "async function beginStagedImport(",
  );

  const end = workerSource.indexOf(
    "\nasync function copyOpfsDatabase(",
    start,
  );

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const body = workerSource.slice(start, end);

  assert.match(
    body,
    /initialiseSchema\(\{ deferTransactionIndexes: true \}\)/,
    "fresh staging database should build the base schema without transaction read indexes",
  );
  assert.doesNotMatch(
    body,
    /deferStagedTransactionIndexes/,
    "fresh staging should not create indexes only to drop them",
  );
});

test("promoted generations rebuild indexes before final validation", () => {
  const start = workerSource.indexOf(
    "async function commitStagedImport(",
  );

  const end = workerSource.indexOf(
    "\nasync function rollbackStagedImport(",
    start,
  );

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const body = workerSource.slice(start, end);

  const openIndex = body.indexOf(
    "database = openPersistentDatabase(targetFilename)",
  );

  const initialiseIndex = body.indexOf(
    "initialiseSchema();",
    openIndex,
  );

  const promotedManifestIndex = body.indexOf(
    "const promotedManifest = currentManifest();",
    initialiseIndex,
  );

  assert.ok(
    openIndex >= 0 &&
      initialiseIndex > openIndex &&
      promotedManifestIndex > initialiseIndex,
    "promoted database must rebuild its full schema before final count validation",
  );
});
