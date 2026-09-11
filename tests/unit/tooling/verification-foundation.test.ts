import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const runner = readFileSync("scripts/run-node-tests.mjs", "utf8");
const workflow = readFileSync(".github/workflows/verify.yml", "utf8");

test("the canonical verification command composes every required gate", () => {
  const verify = packageJson.scripts.verify;

  for (const gate of [
    "static:check",
    "typecheck",
    "test:required",
    "test:web-build",
    "docs:architecture:check",
    "performance:analyze",
    "test:e2e",
  ]) {
    assert.match(verify, new RegExp(`pnpm ${gate.replace(":", "\\:")}`));
  }

  assert.equal(packageJson.scripts["test:quality-gates"], "pnpm verify");
});

test("the test runner invokes tsx through Node without a platform-specific shell", () => {
  assert.match(runner, /resolve\("node_modules\/tsx\/dist\/cli\.mjs"\)/);
  assert.match(runner, /process\.execPath/);
  assert.match(runner, /shell: false/);
});

test("CI runs canonical verification and a Windows required-test smoke job", () => {
  assert.match(workflow, /runs-on: ubuntu-latest[\s\S]*run: pnpm verify/);
  assert.match(workflow, /runs-on: windows-latest[\s\S]*run: pnpm test:required/);
  assert.match(workflow, /pnpm install --frozen-lockfile/g);
  assert.match(workflow, /playwright install --with-deps chromium[\s\S]*run: pnpm verify/);
});

test("Playwright uses an isolated Chromium-only smoke harness", () => {
  const config = readFileSync("playwright.config.ts", "utf8");
  const launcher = readFileSync("scripts/start-e2e-stack.mjs", "utf8");
  const viteConfig = readFileSync("apps/web/vite.config.ts", "utf8");
  const gitignore = readFileSync(".gitignore", "utf8");

  assert.equal(packageJson.scripts["test:e2e"], "playwright test");
  assert.match(config, /testDir: "\.\/tests\/e2e"/);
  assert.match(config, /name: "chromium"/);
  assert.match(launcher, /mkdtempSync\(join\(tmpdir\(\), "budget-app-e2e-"\)\)/);
  assert.match(launcher, /BUDGET_APP_DATA_DIR: stateDirectory/);
  assert.match(launcher, /BUDGET_APP_E2E_HTTP: "1"/);
  assert.match(viteConfig, /process\.env\.BUDGET_APP_E2E_HTTP === "1"/);
  assert.match(viteConfig, /\? undefined\s*:\s*existsSync\(certificatePath\)/);
  assert.match(gitignore, /^playwright-report\/$/m);
  assert.match(gitignore, /^playwright\/\.auth\/$/m);
});
