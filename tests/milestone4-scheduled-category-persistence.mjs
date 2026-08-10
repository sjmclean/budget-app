import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const registerHook = read("apps/web/src/features/accounts/useAccountRegister.ts");
const localClient = read("apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts");
const worker = read("apps/web/src/features/persistence/localFirst/localBudget.worker.ts");
const importer = read("apps/web/src/features/budget/ynab4LauncherImport.ts");
const importClient = read("apps/web/src/features/persistence/localFirst/localFirstYnab4ImportClient.ts");
const shell = read("apps/web/src/layouts/AppShell.tsx");
const maintenance = read("apps/web/src/features/accounts/scheduledTransactionMaintenance.ts");
const generator = read("apps/web/src/features/accounts/scheduledTransactionGenerationService.ts");

assert.match(registerHook, /categoryName:\s*input\.category/);
assert.match(registerHook, /categoryName:\s*line\.category/);
assert.match(localClient, /input\.categoryName\?\.trim\(\)/);
assert.match(localClient, /split\.categoryName\?\.trim\(\)/);
assert.match(worker, /COALESCE\(category_record\.name, transaction_row\.category_name\)/);
assert.match(worker, /COALESCE\(category_record\.name, split\.category_name\)/);

assert.match(importer, /categoryName:\s*transaction\.transferAccountId[\s\S]*transaction\.category/);
assert.match(importer, /categoryName:\s*line\.transferAccountId[\s\S]*line\.category/);
assert.match(importClient, /categoryName:\s*row\.categoryName/);
assert.match(importClient, /categoryName:\s*split\.categoryName/);

assert.match(shell, /setInterval\(generate, 60_000\)/);
assert.match(shell, /visibilitychange/);
assert.match(shell, /addEventListener\("focus", generate\)/);
assert.match(maintenance, /scheduledOccurrenceTransactionId/);
assert.match(maintenance, /listAccounts:\s*\(\)\s*=>\s*queries\.listAccounts\(budgetId\)/);
assert.match(maintenance, /generatedFromSchedule:\s*transaction\.generatedFromSchedule/);
assert.match(worker, /scheduled_occurrence_date/);
assert.match(generator, /localCalendarDate\(\)/);
assert.match(generator, /input\.listAccounts[\s\S]*input\.listAccounts\(\)[\s\S]*gateway\.accounts\.listAccounts\(\)/);
assert.doesNotMatch(generator, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);

console.log("Milestone 4 scheduled generation and category persistence contracts passed.");
