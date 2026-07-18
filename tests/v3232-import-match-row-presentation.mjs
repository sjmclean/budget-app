import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dialogPath =
  'apps/web/src/features/accounts/components/TransactionImportDialog.tsx';
const stylesPath = 'apps/web/src/styles/register.css';

const dialog = readFileSync(dialogPath, 'utf8');
const styles = readFileSync(stylesPath, 'utf8');

assert.match(
  dialog,
  /<details className="transaction-import-register-match-picker">/,
  'multiple register matches should use the custom details-based picker',
);
assert.match(
  dialog,
  /candidate\.matchedTransaction\?\.payee \|\| "—"/,
  'the closed register-row picker should display only the selected payee',
);
assert.doesNotMatch(
  dialog,
  /className="transaction-import-register-match-select"/,
  'the native select that exposed date and category in the payee column should be removed',
);
assert.match(
  dialog,
  /candidate\.matchCandidates\.map\(\(option\) =>/,
  'all eligible register candidates should remain available in deterministic order',
);
assert.match(
  dialog,
  /formatImportReviewDate\(\s*option\.transaction\.date,?\s*\)/,
  'dropdown options should retain the register transaction date',
);
assert.match(
  dialog,
  /option\.transaction\.category \|\| "—"/,
  'dropdown options should retain the register transaction category',
);
assert.match(
  dialog,
  /matchedIdsUsedByOtherRows\.has\(\s*option\.transaction\.id,?\s*\)/,
  'register transactions already consumed by another row should remain unavailable',
);
assert.match(
  styles,
  /\.transaction-import-proposed-payee > strong,\s*\.transaction-import-register-match-summary strong\s*\{[^}]*font-size:\s*0\.9rem;[^}]*font-weight:\s*750;/s,
  'bank and register payee text should share the same visual size and weight',
);
assert.match(
  styles,
  /\.transaction-import-register-match-options\s*\{[^}]*position:\s*absolute;/s,
  'the candidate list should render as a compact dropdown',
);

console.log('v3.23.2 import match row presentation tests passed');
