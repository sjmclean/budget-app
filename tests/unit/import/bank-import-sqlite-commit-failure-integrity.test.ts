import assert from "node:assert/strict";
import test from "node:test";

import {
  runAccountRegisterSqliteMutation,
} from "../../../apps/web/src/features/accounts/accountRegisterMutationRunner.js";

test("SQLite register mutation failure is propagated to the import commit caller", async () => {
  const failure = new Error("sqlite batch rolled back");
  const reportedErrors: string[] = [];

  await assert.rejects(
    () =>
      runAccountRegisterSqliteMutation(
        async () => {
          throw failure;
        },
        (message) => {
          reportedErrors.push(message);
        },
      ),
    failure,
    "a rolled-back SQLite batch must reject instead of being reported as committed",
  );

  assert.deepEqual(reportedErrors, ["sqlite batch rolled back"]);
});
