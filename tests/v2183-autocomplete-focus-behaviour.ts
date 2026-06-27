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
const packageJson = readFileSync("package.json", "utf8");

assert(packageJson.includes('"test:v2183"'), "package.json should include test:v2183");
assert(
  packageJson.includes('"test:v2183:autocomplete-focus-behaviour"'),
  "package.json should include test:v2183:autocomplete-focus-behaviour",
);

assert(
  !registerPage.includes("onFocus={() => setIsOpen(true)}"),
  "autocomplete should not open suggestions merely on focus",
);

assert(
  (registerPage.match(/onFocus=\{\(\) => setIsOpen\(false\)\}/g) ?? []).length >= 2,
  "payee and category autocomplete should remain closed on focus",
);

assert(
  registerPage.includes("setIsOpen(nextValue.trim().length > 0)"),
  "typing non-empty text should open autocomplete suggestions",
);

assert(
  registerPage.includes("shouldShowGhost = shouldShowSuggestions && Boolean(ghostCompletion)"),
  "ghost completion should only display when suggestions are active",
);

assert(
  registerPage.includes('event.key === "ArrowDown" && suggestions.length > 0') &&
    registerPage.includes("setIsOpen(true)"),
  "down arrow should explicitly open suggestions for browsing",
);

console.log("v2.18.3 autocomplete focus behaviour regression checks passed");
