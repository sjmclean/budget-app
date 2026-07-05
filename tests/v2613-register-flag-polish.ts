import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("apps/web/src/styles/register.css", "utf8");

function run() {
  assert.match(
    css,
    /\.transaction-flag\s*\{[\s\S]*?width:\s*0\.42rem;[\s\S]*?height:\s*0\.42rem;/,
    "Register flag dot should be a subtle indicator rather than a large badge",
  );

  assert.match(
    css,
    /\.flag-colour-picker-button\s*\{[\s\S]*?width:\s*1\.55rem;[\s\S]*?min-width:\s*1\.55rem;[\s\S]*?height:\s*1\.55rem;/,
    "Register flag picker button should have a compact hit area around the dot",
  );

  assert.match(
    css,
    /\.register-layout-compact \.flag-colour-picker,[\s\S]*?\.register-layout-compact \.flag-colour-picker-button\s*\{[\s\S]*?width:\s*1\.55rem;[\s\S]*?height:\s*1\.55rem;/,
    "Compact register rows should not enlarge the flag picker",
  );

  assert.match(
    css,
    /\.register-row-tablet \.flag-colour-picker,[\s\S]*?\.register-row-tablet \.flag-colour-picker-button\s*\{[\s\S]*?width:\s*1\.55rem;[\s\S]*?height:\s*1\.55rem;/,
    "Tablet register rows should not enlarge the flag picker",
  );

  console.log("v2.61.3 register flag polish checks passed");
}

run();
