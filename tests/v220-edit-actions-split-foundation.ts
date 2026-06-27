import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const registerPage = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const css = readFileSync("apps/web/src/styles/register.css", "utf8");
const pkg = readFileSync("package.json", "utf8");

assert(pkg.includes('"test:v220"'), "package.json should include test:v220");
assert(
  pkg.includes('"test:v220:edit-actions-split-foundation"'),
  "package.json should include test:v220:edit-actions-split-foundation",
);

const editRowStart = registerPage.indexOf("function TransactionEditRow");
const editRowEnd = registerPage.indexOf("function clampPageForTransactionCount");
assert(editRowStart > -1 && editRowEnd > editRowStart, "TransactionEditRow should be present");
const editRow = registerPage.slice(editRowStart, editRowEnd);

assert(
  editRow.includes('className="register-edit-actions-panel"'),
  "edit row should render Save/Cancel in a dedicated panel below the fields",
);

assert(
  editRow.includes('className="register-edit-actions register-edit-commit-actions"'),
  "edit row commit actions should use the shared edit action styling",
);

assert(!editRow.includes(">Split</button>"), "edit row should not render an inline Split button");

assert(
  editRow.indexOf('className="register-row register-row-editing"') <
    editRow.indexOf('className="register-edit-actions-panel"'),
  "edit action panel should render after the edit field row",
);

assert(css.includes(".register-edit-actions-panel"), "edit actions panel should have CSS");
assert(css.includes(".register-edit-commit-actions"), "edit commit actions should have CSS");

console.log("v2.20 edit actions split foundation checks passed");
