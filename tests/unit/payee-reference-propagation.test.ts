import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  propagatePayeeMergeReferences,
  propagatePayeeRenameReferences,
} from "../../apps/web/src/features/accounts/usePayeeManagerWorkflow.ts";

describe("payee reference propagation orchestration", () => {
  it("does not replay rename references when persistence already propagated them", async () => {
    let scheduledCalls = 0;
    let registerCalls = 0;

    await propagatePayeeRenameReferences({
      persistenceAlreadyPropagatedReferences: true,
      input: {
        payeeId: "payee-1",
        previousName: "Old name",
        nextName: "New name",
      },
      renameScheduledReferences: async () => {
        scheduledCalls += 1;
      },
      renameRegisterReferences: async () => {
        registerCalls += 1;
      },
    });

    assert.equal(scheduledCalls, 0);
    assert.equal(registerCalls, 0);
  });

  it("propagates rename references for persistence that does not do it itself", async () => {
    const calls: string[] = [];

    await propagatePayeeRenameReferences({
      persistenceAlreadyPropagatedReferences: false,
      input: {
        payeeId: "payee-1",
        previousName: "Old name",
        nextName: "New name",
      },
      renameScheduledReferences: async () => {
        calls.push("scheduled");
      },
      renameRegisterReferences: async () => {
        calls.push("register");
      },
    });

    assert.deepEqual(calls, ["scheduled", "register"]);
  });

  it("does not replay merge references when persistence already propagated them", async () => {
    let scheduledCalls = 0;
    let registerCalls = 0;

    await propagatePayeeMergeReferences({
      persistenceAlreadyPropagatedReferences: true,
      input: {
        sourcePayeeId: "source",
        sourceName: "Source",
        targetPayeeId: "target",
        targetName: "Target",
      },
      reassignScheduledReferences: async () => {
        scheduledCalls += 1;
      },
      reassignRegisterReferences: async () => {
        registerCalls += 1;
      },
    });

    assert.equal(scheduledCalls, 0);
    assert.equal(registerCalls, 0);
  });

  it("propagates merge references for persistence that does not do it itself", async () => {
    const calls: string[] = [];

    await propagatePayeeMergeReferences({
      persistenceAlreadyPropagatedReferences: false,
      input: {
        sourcePayeeId: "source",
        sourceName: "Source",
        targetPayeeId: "target",
        targetName: "Target",
      },
      reassignScheduledReferences: async () => {
        calls.push("scheduled");
      },
      reassignRegisterReferences: async () => {
        calls.push("register");
      },
    });

    assert.deepEqual(calls, ["scheduled", "register"]);
  });
});
