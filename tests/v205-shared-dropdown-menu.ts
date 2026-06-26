import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dropdownMenuSource = readFileSync(
  "apps/web/src/features/ui/DropdownMenu.tsx",
  "utf8",
);
const columnVisibilityMenuSource = readFileSync(
  "apps/web/src/features/tableLayout/ColumnVisibilityMenu.tsx",
  "utf8",
);
const registerPageSource = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.match(
  dropdownMenuSource,
  /export function DropdownMenu/,
  "shared DropdownMenu component should exist",
);
assert.match(
  dropdownMenuSource,
  /document\.addEventListener\("pointerdown"/,
  "DropdownMenu should close on outside pointer interactions",
);
assert.match(
  dropdownMenuSource,
  /event\.key === "Escape"/,
  "DropdownMenu should close on Escape",
);
assert.match(
  dropdownMenuSource,
  /triggerRef\.current\?\.focus\(\)/,
  "DropdownMenu should restore focus to its trigger when requested",
);
assert.match(
  dropdownMenuSource,
  /aria-haspopup="menu"/,
  "DropdownMenu trigger should expose menu semantics",
);
assert.match(
  dropdownMenuSource,
  /aria-expanded=\{isOpen\}/,
  "DropdownMenu trigger should expose expanded state",
);

assert.match(
  columnVisibilityMenuSource,
  /import \{ DropdownMenu \} from "\.\.\/ui\/DropdownMenu"/,
  "shared ColumnVisibilityMenu should use the shared DropdownMenu",
);
assert.doesNotMatch(
  columnVisibilityMenuSource,
  /document\.addEventListener/,
  "ColumnVisibilityMenu should not own document-level menu listeners anymore",
);

assert.match(
  registerPageSource,
  /import \{ DropdownMenu \} from "\.\.\/features\/ui\/DropdownMenu"/,
  "AccountRegisterPage should import the shared DropdownMenu",
);
assert.match(
  registerPageSource,
  /<ColumnVisibilityMenu\s+label="Columns ▾"/,
  "Register Columns menu should use the shared ColumnVisibilityMenu wrapper",
);
assert.match(
  registerPageSource,
  /<DropdownMenu\s+label="More ▾"/,
  "Register More menu should use the shared DropdownMenu",
);
assert.doesNotMatch(
  registerPageSource,
  /isColumnsMenuOpen|setIsColumnsMenuOpen|isMoreMenuOpen|setIsMoreMenuOpen/,
  "Register page should not keep duplicated dropdown open state for Columns/More menus",
);

assert.equal(
  packageJson.scripts["test:v205:shared-dropdown-menu"],
  "tsx tests/v205-shared-dropdown-menu.ts",
  "package.json should expose the v2.05 shared dropdown test",
);
assert.equal(
  packageJson.scripts["test:v205"],
  "pnpm test:v205:shared-dropdown-menu",
  "package.json should expose the v2.05 aggregate test",
);

console.log("v2.05 shared dropdown/menu framework checks passed");
