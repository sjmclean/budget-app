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

assert(
  packageJson.includes('"test:v2151"'),
  "package.json should include test:v2151",
);

assert(
  packageJson.includes('"test:v2151:autocomplete-keyboard-flow"'),
  "package.json should include test:v2151:autocomplete-keyboard-flow",
);

assert(
  registerPage.includes('event.key === "Tab" && !event.shiftKey && shouldShowGhost'),
  "Autocomplete Tab acceptance should only apply to forward Tab navigation",
);

assert(
  !registerPage.includes('event.key === "Tab" && shouldShowGhost) {\n            event.preventDefault();'),
  "Autocomplete Tab acceptance should not prevent normal focus movement",
);

assert(
  registerPage.includes('aria-label="Choose date"\n        tabIndex={-1}'),
  "Calendar picker button should be skipped by keyboard tab order",
);

assert(
  registerPage.includes('event.key === "Enter") {\n            event.preventDefault();'),
  "Enter should still explicitly accept autocomplete suggestions",
);

console.log("v2.15.1 autocomplete keyboard flow regression checks passed");
