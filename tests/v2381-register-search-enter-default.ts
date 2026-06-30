import { readFileSync } from "node:fs";
import { join } from "node:path";

const registerPage = readFileSync(
  join(process.cwd(), "apps/web/src/pages/AccountRegisterPage.tsx"),
  "utf8",
);

function expectContains(value: string): void {
  if (!registerPage.includes(value)) {
    throw new Error(`Missing expected text: ${value}`);
  }
}

expectContains("useState<number | null>(null)");
expectContains("activeRegisterSearchSuggestionIndex !== null");
expectContains('scope: "all"');
expectContains('{ key: "search", label: "Search", icon: "🔎" }');
expectContains("searchEverywhereAction");

console.log("v2.38.1 register search enter-default checks passed");
