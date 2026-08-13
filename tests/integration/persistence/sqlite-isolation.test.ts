import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { describe, it } from "node:test";
import { SqliteBudgetScenario, withSqliteBudgetScenario } from "../../support/persistence/sqliteBudgetScenario.js";

describe("SQLite test scenario isolation", () => {
  it("creates unique database directories and removes them idempotently", () => {
    const first = SqliteBudgetScenario.create();
    const second = SqliteBudgetScenario.create();
    const firstDirectory = dirname(first.databasePath);
    const secondDirectory = dirname(second.databasePath);
    try {
      assert.notEqual(first.databasePath, second.databasePath);
      assert.notEqual(firstDirectory, secondDirectory);
      assert.equal(existsSync(firstDirectory), true);
      assert.equal(existsSync(secondDirectory), true);
    } finally {
      first.cleanup();
      first.cleanup();
      second.cleanup();
    }
    assert.equal(existsSync(firstDirectory), false);
    assert.equal(existsSync(secondDirectory), false);
  });

  it("cleans up when the scenario callback throws", async () => {
    let databasePath = "";
    await assert.rejects(
      withSqliteBudgetScenario((scenario) => {
        databasePath = scenario.databasePath;
        throw new Error("expected assertion failure");
      }),
      /expected assertion failure/,
    );
    assert.equal(existsSync(dirname(databasePath)), false);
  });
});
