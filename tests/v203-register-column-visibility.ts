import { readFileSync } from "node:fs";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const registerPage = readFileSync(
  "apps/web/src/pages/AccountRegisterPage.tsx",
  "utf8",
);
const registerCss = readFileSync("apps/web/src/styles/register.css", "utf8");
const packageJson = readFileSync("package.json", "utf8");

[
  "type RegisterOptionalColumnId",
  "REGISTER_OPTIONAL_COLUMNS",
  "DEFAULT_VISIBLE_REGISTER_OPTIONAL_COLUMNS",
  "REGISTER_COLUMN_DEFINITIONS",
  "readRegisterColumnPreferences",
  "writeRegisterColumnPreferences",
  "buildRegisterColumns",
  "buildRegisterRowStyle",
  "RegisterColumnsMenu",
  "visibleRegisterColumnSet",
  "handleToggleRegisterColumn",
  "handleResetRegisterColumns",
  "isColumnsMenuOpen",
  "Columns",
  "Reset columns",
].forEach((marker) => {
  assert(
    registerPage.includes(marker),
    `Expected AccountRegisterPage.tsx to include ${marker}.`,
  );
});

[
  '"flag"',
  '"attachments"',
  '"memo"',
  '"checkNumber"',
  '"runningBalance"',
  '"status"',
].forEach((column) => {
  assert(
    registerPage.includes(column),
    `Expected register optional column ${column}.`,
  );
});

[
  "isRegisterColumnVisible(\"flag\"",
  "isRegisterColumnVisible(\"attachments\"",
  "isRegisterColumnVisible(\"memo\"",
  "isRegisterColumnVisible(\"checkNumber\"",
  "isRegisterColumnVisible(\"runningBalance\"",
  "isRegisterColumnVisible(\"status\"",
].forEach((marker) => {
  assert(
    registerPage.includes(marker),
    `Expected register rows to guard optional column with ${marker}.`,
  );
});

[
  "register-columns-menu-panel",
  "register-column-toggle",
  "register-column-reset",
].forEach((marker) => {
  assert(registerCss.includes(marker), `Expected register.css to include ${marker}.`);
});

assert(packageJson.includes("test:v203"), "Expected package.json to include test:v203.");

console.log("v2.03 register column visibility checks passed");
