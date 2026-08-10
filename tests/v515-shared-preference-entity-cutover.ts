import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const settings = readFileSync("apps/web/src/features/settings/settingsPreferences.ts", "utf8");
const imports = readFileSync("apps/web/src/features/accounts/transactionImportPreferences.ts", "utf8");
assert.doesNotMatch(settings, /storage\.setItem\(SETTINGS_STORAGE_KEY/);
assert.match(settings, /writeSettingsPreferenceEntity/);
assert.doesNotMatch(imports, /storage\.setItem\(\s*TRANSACTION_IMPORT_PREFERENCES_KEY/);
assert.match(imports, /writeTransactionImportPreferenceEntity/);
console.log("v5.15 shared preference entity cutover checks passed");
