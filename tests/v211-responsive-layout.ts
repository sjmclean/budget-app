import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const globalsCss = read("apps/web/src/styles/globals.css");
const packageJson = read("package.json");

assert(packageJson.includes('"test:v211"'), "package.json should include test:v211");
assert(packageJson.includes('"test:v211:responsive-layout"'), "package.json should include test:v211:responsive-layout");

assert(globalsCss.includes("min-width: 0"), "layout should allow children to shrink");
assert(globalsCss.includes("overflow-x: auto"), "layout should use local horizontal scrolling");
assert(globalsCss.includes("flex-wrap: wrap"), "toolbar/header controls should wrap");
assert(globalsCss.includes("@media (max-width:"), "responsive breakpoint should exist");

console.log("v2.11 responsive layout regression checks passed");
