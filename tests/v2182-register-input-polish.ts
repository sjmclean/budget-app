import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const registerCss = readFileSync("apps/web/src/styles/register.css", "utf8");
const packageJson = readFileSync("package.json", "utf8");

assert(packageJson.includes('"test:v2182"'), "package.json should include test:v2182");
assert(
  packageJson.includes('"test:v2182:register-input-polish"'),
  "package.json should include test:v2182:register-input-polish",
);

assert(
  /\.register-entry-row-active\s*{[^}]*overflow:\s*visible;/s.test(registerCss),
  "active register entry row should not create its own scrollbar",
);

assert(
  /\.register-payee-autocomplete\s*{[^}]*overflow:\s*visible;/s.test(registerCss),
  "autocomplete wrapper should allow popup overflow",
);

assert(
  /\.register-payee-suggestions\s*{[^}]*z-index:\s*1000;/s.test(registerCss) ||
    /\.register-autocomplete-popup\s*{[^}]*z-index:\s*1000;/s.test(registerCss),
  "autocomplete popup should render above the register entry row",
);

assert(
  /\.register-entry-row-active input\s*{[^}]*overflow:\s*hidden;/s.test(registerCss),
  "single-line register entry inputs should not show tiny scrollbars",
);

console.log("v2.18.2 register input polish regression checks passed");
