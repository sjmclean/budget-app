import assert from "node:assert/strict";
import { createScheduledHarness } from "./support/scheduledTransactionHarness.ts";


const service = createScheduledHarness();
const master = {
  id: "rates-pdf",
  fileName: "rates.pdf",
  fileSize: 4,
  mimeType: "application/pdf",
  attachedAt: "2026-08-06T00:00:00.000Z",
  contentHash: `sha256:${"a".repeat(64)}`,
  contentBase64: "AQIDBA==",
};

const created = await service.create({
  accountId: "checking",
  nextDueDate: "2026-09-30",
  frequency: "monthly",
  payee: "Council rates",
  category: "Rates",
  outflow: 250,
  inflow: 0,
  attachments: [master],
});
assert.deepEqual(created[0]?.attachments, [master]);

const registerInput = service.toRegisterInput(created[0]!);
assert.deepEqual(registerInput.scheduledAttachments, [master]);
registerInput.scheduledAttachments![0]!.fileName = "changed.pdf";
assert.equal(created[0]?.attachments?.[0]?.fileName, "rates.pdf", "register materialisation cannot mutate the template");

const reloaded = await service.listByAccount("checking");
assert.equal(reloaded[0]?.attachments?.[0]?.contentBase64, "AQIDBA==");
assert.equal(reloaded[0]?.attachments?.[0]?.contentHash, master.contentHash);

console.log("Milestone 4 Phase 3 scheduled attachments passed: template persistence and isolated materialisation.");
