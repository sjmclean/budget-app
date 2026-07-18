import fs from 'node:fs';

const dialog = fs.readFileSync(
  'apps/web/src/features/accounts/components/TransactionImportDialog.tsx',
  'utf8',
);
const commit = fs.readFileSync(
  'apps/web/src/features/accounts/transactionImportCommit.ts',
  'utf8',
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  !/setCandidates\(\(current\) => \{[\s\S]*setProcessedCandidates/.test(dialog),
  'Processing history must not be mutated from inside a React state updater.',
);
assert(
  dialog.includes('processed.filter((entry) => entry.candidate.id !== candidateId)'),
  'Processed candidates must be unique by candidate id.',
);
assert(
  dialog.includes('const uniqueProcessedCandidates = Array.from('),
  'Commit and completion counts must use unique processed candidates.',
);
assert(
  dialog.includes('money-positive') && dialog.includes('money-negative'),
  'Import comparison amounts must use register positive/negative colours.',
);
assert(
  commit.includes('resolvedCategory?.id'),
  'Imported category names must resolve to register category ids.',
);

console.log('v3.19.7 import commit integrity checks passed');
