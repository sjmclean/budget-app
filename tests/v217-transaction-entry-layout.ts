import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
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

assert(packageJson.includes('"test:v217"'), "package.json should include test:v217");
assert(
  packageJson.includes('"test:v217:transaction-entry-layout"'),
  "package.json should include test:v217:transaction-entry-layout",
);

assert(
  registerPage.includes("buildRegisterEntryVisibleColumnIds"),
  "entry row should derive its visible columns from the register column configuration",
);

assert(
  registerPage.includes('isRegisterColumnVisible("checkNumber", visibleColumns)'),
  "entry row should only render Check # when the register column is visible",
);

assert(
  registerPage.includes('isRegisterColumnVisible("memo", visibleColumns)'),
  "entry row should only render Memo when the register column is visible",
);

assert(
  registerPage.includes("registerEntryRowStyle"),
  "entry row should use a row style derived from register layout widths",
);

const entryRowIndex = registerPage.indexOf('className="register-entry-row-active register-entry-row-workflow"');
const actionsPanelIndex = registerPage.indexOf('className="register-entry-actions-panel"');
assert(entryRowIndex >= 0, "entry row should still be rendered");
assert(actionsPanelIndex > entryRowIndex, "entry actions should be rendered below the entry row");

const actionsBlock = registerPage.slice(actionsPanelIndex, actionsPanelIndex + 1400);
const saveAnotherIndex = actionsBlock.indexOf("Save & add another");
const saveIndex = actionsBlock.indexOf(">\n            Save\n          </button>");
const cancelIndex = actionsBlock.indexOf(">\n            Cancel\n          </button>");
assert(saveAnotherIndex >= 0, "entry actions should include Save & add another");
assert(saveIndex > saveAnotherIndex, "Save should follow Save & add another");
assert(cancelIndex > saveIndex, "Cancel should follow Save");

assert(
  registerCss.includes(".register-entry-actions-panel"),
  "entry actions panel should have dedicated styling",
);
assert(
  !registerCss.includes(".register-entry-actions-wide"),
  "old inline wide actions styling should be removed",
);

console.log("v2.17 transaction entry layout regression checks passed");
