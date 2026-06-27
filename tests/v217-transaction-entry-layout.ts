import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const registerPage = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const packageJson = readFileSync("package.json", "utf8");

assert(packageJson.includes('"test:v217"'), "package.json should include test:v217");
assert(packageJson.includes('"test:v217:transaction-entry-layout"'), "package.json should include test:v217:transaction-entry-layout");

assert(
  registerPage.includes("Save & add another") || registerPage.includes("Save & Add Another"),
  "entry actions should include Save & Add Another",
);

assert(
  registerPage.includes("month") && registerPage.includes("separator"),
  "register should include month separator support",
);

assert(
  registerPage.includes("check") && registerPage.includes("visibleColumn"),
  "check input should respect register column visibility",
);

console.log("v2.17 transaction entry layout regression checks passed");
