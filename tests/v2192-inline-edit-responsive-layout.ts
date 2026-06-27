import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const registerPage = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const css = readFileSync("apps/web/src/styles/register.css", "utf8");
const pkg = readFileSync("package.json", "utf8");

assert(pkg.includes('"test:v2192"'), "package.json should include test:v2192");
assert(
  pkg.includes('"test:v2192:inline-edit-responsive-layout"'),
  "package.json should include test:v2192:inline-edit-responsive-layout",
);

assert(
  registerPage.includes("registerEditRowStyle") &&
    registerPage.includes("style={rowStyle}") &&
    registerPage.includes("REGISTER_EDIT_COLUMN_DEFINITIONS"),
  "inline edit rows should use the shared table row layout style",
);

assert(
  registerPage.includes('template: "minmax(6.5rem, 8rem)"') &&
    registerPage.includes('id: "actions"'),
  "edit action column should use a compact responsive minmax width",
);

const editingBlocks = [...css.matchAll(/\.register-row-editing\s*\{([\s\S]*?)\}/g)].map((match) => match[1]);
assert(editingBlocks.length > 0, "register-row-editing styles should exist");
assert(
  editingBlocks.every((block) => !block.includes("grid-template-columns")),
  "register-row-editing CSS should not override shared grid-template-columns",
);

assert(
  css.includes(".register-edit-actions") &&
    css.includes("flex-wrap: wrap") &&
    css.includes("justify-content: flex-end"),
  "edit action buttons should wrap and stay aligned inside the responsive edit row",
);

console.log("v2.19.2 inline edit responsive layout checks passed");
