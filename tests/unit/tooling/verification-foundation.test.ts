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
});
