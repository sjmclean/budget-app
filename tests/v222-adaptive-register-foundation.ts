import { readFileSync } from "node:fs";
import { resolveRegisterLayoutMode } from "../apps/web/src/features/accounts/registerLayoutMode";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(resolveRegisterLayoutMode(1440) === "desktop", "wide registers should use desktop mode");
assert(resolveRegisterLayoutMode(1280) === "compact", "compact breakpoint should use compact mode");
assert(resolveRegisterLayoutMode(900) === "tablet", "tablet breakpoint should use tablet mode");
assert(resolveRegisterLayoutMode(680) === "mobile", "mobile breakpoint should use mobile mode");

const registerLayoutMode = readFileSync(
  "apps/web/src/features/accounts/registerLayoutMode.ts",
  "utf8",
);
const registerPage = readFileSync(
  "apps/web/src/pages/AccountRegisterPage.tsx",
  "utf8",
);

assert(
  registerLayoutMode.includes('export type RegisterLayoutMode = "desktop" | "compact" | "tablet" | "mobile"'),
  "adaptive register should define explicit layout modes",
);

assert(
  registerLayoutMode.includes("REGISTER_LAYOUT_BREAKPOINTS") &&
    registerLayoutMode.includes("resolveRegisterLayoutMode") &&
    registerLayoutMode.includes("useRegisterLayoutMode"),
  "adaptive register should expose breakpoints, a resolver, and a React hook",
);

assert(
  registerPage.includes("useRegisterLayoutMode") &&
    registerPage.includes("registerLayoutMode") &&
    registerPage.includes("register-layout-${registerLayoutMode}"),
  "account register should attach the resolved layout mode without changing rendering yet",
);

assert(
  registerPage.includes("registerTableLayout.rowStyle") &&
    registerPage.includes("TransactionRow"),
  "desktop register rendering should remain intact during the foundation step",
);

console.log("v2.22 adaptive register foundation checks passed");
