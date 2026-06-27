import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const page = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const css = readFileSync("apps/web/src/styles/register.css", "utf8");
const pkg = readFileSync("package.json", "utf8");

assert(pkg.includes('"test:v2201"'), "package.json should include test:v2201");
assert(pkg.includes('"test:v2201:edit-actions-placement"'), "package.json should include test:v2201:edit-actions-placement");

assert(page.includes("editActionGridColumn"), "edit row should calculate amount-column action placement");
assert(page.includes("gridColumn: editActionGridColumn"), "edit actions should be placed under amount columns");
assert(page.includes('className="register-edit-actions-panel"'), "edit row should use an actions panel");
assert(!page.includes(">Split</button>"), "inline edit row should not include a Split button");

assert(css.includes(".register-edit-actions-panel"), "edit actions panel CSS should exist");
assert(css.includes("display: grid"), "edit actions panel should use grid placement");

console.log("v2.20.1 edit action placement checks passed");
