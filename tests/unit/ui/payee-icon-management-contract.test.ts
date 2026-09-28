import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync(new URL("../../../apps/web/src/pages/PayeeManagementPage.tsx", import.meta.url), "utf8");

test("Payee Management exposes the scalable merchant-aware icon picker", () => {
  assert.match(page, /<PayeeIcon payee=\{payee\} size=\{32\}/);
  assert.match(page, /aria-label=\{`Change icon for \$\{selectedPayee\.name\}`\}/);
  assert.match(page, /role="radiogroup" aria-label="Payee icon"/);
  assert.match(page, />Automatic<\/span>/);
  assert.match(page, /PAYEE_SPECIAL_ICONS\.map/);
  assert.match(page, /kind: "special", key/);
  assert.match(page, /PAYEE_BUILTIN_ICONS\.map/);
  assert.match(page, /searchMerchantIcons\(iconSearch, 48\)/);
  assert.match(page, /placeholder="Search merchant icons…"/);
  assert.match(page, /kind: "merchant", key: merchant\.key/);
  assert.match(page, />Cancel<\/button>/);
  assert.match(page, />Save icon<\/button>/);
});
