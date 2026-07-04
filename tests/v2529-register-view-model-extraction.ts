import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const viewModelPath = join(
  process.cwd(),
  "apps/web/src/features/accounts/useRegisterViewModel.ts",
);

assert.ok(
  existsSync(viewModelPath),
  "useRegisterViewModel.ts should exist",
);

const registerPage = readFileSync(
  join(process.cwd(), "apps/web/src/pages/AccountRegisterPage.tsx"),
  "utf8",
);

const viewModel = readFileSync(viewModelPath, "utf8");

assert.match(
  registerPage,
  /useRegisterViewModel/,
  "AccountRegisterPage should use the extracted register view model",
);

assert.match(
  viewModel,
  /export function useRegisterViewModel/,
  "The view model hook should be exported",
);

assert.match(
  viewModel,
  /return\s*{/,
  "The view model should expose derived register state",
);

console.log("v2.52.9 register view model extraction checks passed");