import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const css = readFileSync("apps/web/src/styles/register.css", "utf8");
const globalCss = readFileSync("apps/web/src/styles/globals.css", "utf8");
const allCss = `${css}\n${globalCss}`;
const pkg = readFileSync("package.json", "utf8");

assert(pkg.includes('"test:v219"'), "package.json should include test:v219");
assert(pkg.includes('"test:v219:register-layout"'), "package.json should include test:v219:register-layout");

assert(
  css.includes("grid-template-columns") &&
    css.includes("minmax(") &&
    css.includes("fr"),
  "register layout should use responsive minmax/fr columns",
);

assert(
  css.includes("text-align: right"),
  "money columns should have right alignment support",
);

assert(
  css.includes("text-overflow: ellipsis") &&
    css.includes("white-space: nowrap"),
  "register flexible text columns should truncate with ellipsis",
);

assert(
  allCss.includes("max-width: none") ||
    allCss.includes("width: 100%") ||
    allCss.includes("min-width: 0"),
  "workspace/register styles should support full-width layout",
);

console.log("v2.19 register layout checks passed");
