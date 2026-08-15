import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync(new URL("../../../apps/web/src/pages/PayeeManagementPage.tsx", import.meta.url), "utf8");

test("Payee Management exposes the accessible Phase 1A icon picker", () => {
  assert.match(page, /<PayeeIcon payee=\{payee\} size=\{32\}/);
  assert.match(page, /aria-label=\{`Change icon for \$\{selectedPayee\.name\}`\}/);
  assert.match(page, /role="radiogroup" aria-label="Payee icon"/);
  assert.match(page, />Automatic<\/span>/);
  assert.match(page, /PAYEE_BUILTIN_ICONS\.map/);
  assert.match(page, />Cancel<\/button>/);
  assert.match(page, />Save icon<\/button>/);
  assert.doesNotMatch(page, /Upload icon|external logo|merchant search/i);
});
