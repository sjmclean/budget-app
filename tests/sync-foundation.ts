import { createFileFingerprint } from "../packages/sync/src/createFileFingerprint.js";
import { detectSyncConflict } from "../packages/sync/src/detectSyncConflict.js";

const local = createFileFingerprint({
  budgetId: "budget",
  filePath: "Test.budget",
  fileSize: 1000,
  modifiedAt: 100
});

const remoteSame = createFileFingerprint({
  budgetId: "budget",
  filePath: "Test.budget",
  fileSize: 1000,
  modifiedAt: 100
});

const remoteChanged = createFileFingerprint({
  budgetId: "budget",
  filePath: "Test.budget",
  fileSize: 1200,
  modifiedAt: 200
});

console.log(detectSyncConflict(local, remoteSame));
console.log(detectSyncConflict(local, remoteChanged));
