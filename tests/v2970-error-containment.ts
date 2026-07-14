import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildAppErrorDiagnostics,
  formatAppErrorDiagnostics,
} from "../apps/web/src/app/errors/appErrorDiagnostics";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const app = read("apps/web/src/App.tsx");
const router = read("apps/web/src/app/router.tsx");
const main = read("apps/web/src/main.tsx");
const boundary = read("apps/web/src/app/errors/AppErrorBoundary.tsx");
const recovery = read("apps/web/src/app/errors/AppRecoveryScreen.tsx");
const packageJson = read("package.json");

assert.match(app, /<AppErrorBoundary>/, "the application should have a root React error boundary");
assert.match(router, /errorElement:\s*<RouteErrorScreen\s*\/>/, "top-level routes should provide recovery UI");
assert.match(main, /catch \(error\)/, "bootstrap should catch startup failures");
assert.match(main, /<StartupRecoveryScreen error=\{error\}\s*\/>/, "startup failures should render recovery UI");
assert.match(boundary, /componentDidCatch/, "the root boundary should record render errors");
assert.match(recovery, /Export diagnostics/, "recovery UI should support diagnostic export");
assert.match(recovery, /Reload application/, "recovery UI should offer reload");
assert.match(recovery, /Return to budget selector/, "recovery UI should offer a safe destination");
assert.match(packageJson, /"test:v2970"/, "package.json should expose the v2.97 regression test");

const diagnostics = buildAppErrorDiagnostics(new Error("test failure"), "startup");
const formatted = formatAppErrorDiagnostics(diagnostics);

assert.equal(diagnostics.source, "startup");
assert.equal(diagnostics.errorMessage, "test failure");
assert.match(formatted, /Budget App diagnostic report/);
assert.match(formatted, /test failure/);
assert.match(formatted, /Source: startup/);

console.log("v2.97.0 application error containment tests passed");
