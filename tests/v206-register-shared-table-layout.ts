import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const root = process.cwd();
const registerPage = readFileSync(
  join(root, "apps/web/src/pages/AccountRegisterPage.tsx"),
  "utf8",
);
const tableLayout = readFileSync(
  join(root, "apps/web/src/features/tableLayout/tableLayout.ts"),
  "utf8",
);
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

assert(
  registerPage.includes("../features/tableLayout/ColumnVisibilityMenu"),
  "Register page should use the shared ColumnVisibilityMenu.",
);
assert(
  registerPage.includes("../features/tableLayout/tableLayout"),
  "Register page should import the shared tableLayout module.",
);
assert(
  registerPage.includes("useTableLayout<RegisterColumnId>"),
  "Register page should use the shared useTableLayout hook.",
);
assert(
  registerPage.includes("buildTableRowStyle("),
  "Register edit rows should use the shared buildTableRowStyle helper.",
);
assert(
  registerPage.includes("REGISTER_TABLE_LAYOUT_STORAGE_KEY_PREFIX"),
  "Register table layout storage key should be named as table layout storage.",
);
assert(
  !registerPage.includes("function RegisterColumnsMenu"),
  "Register-specific columns menu should be removed.",
);
assert(
  !registerPage.includes("readRegisterColumnPreferences"),
  "Register-specific column preference reader should be removed.",
);
assert(
  !registerPage.includes("writeRegisterColumnPreferences"),
  "Register-specific column preference writer should be removed.",
);
assert(
  !registerPage.includes("buildRegisterRowStyle"),
  "Register-specific row style builder should be removed.",
);
assert(
  tableLayout.includes("export function useTableLayout"),
  "Shared table layout hook should remain exported.",
);
assert(
  packageJson.scripts["test:v206:register-shared-table-layout"] ===
    "tsx tests/v206-register-shared-table-layout.ts",
  "package.json should expose the v2.06 register shared table layout test.",
);
assert(
  packageJson.scripts["test:v206"] === "pnpm test:v206:register-shared-table-layout",
  "package.json should expose the v2.06 aggregate test command.",
);

console.log("v2.06 register shared table layout regression checks passed");
