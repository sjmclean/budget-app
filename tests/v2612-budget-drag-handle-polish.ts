import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("apps/web/src/styles/globals.css", "utf8");

function blockFor(selector: string) {
  const match = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{(?<body>[\\s\\S]*?)\\}`));
  assert.ok(match?.groups?.body, `Expected ${selector} CSS block to exist`);
  return match.groups.body;
}

function run() {
  const categoryCell = blockFor(".budget-category-cell");
  assert.match(categoryCell, /gap:\s*0\.3rem;/, "Budget category icon spacing should be tighter");
  assert.match(categoryCell, /padding-left:\s*0\.05rem;/, "Budget category row indicator should not consume excessive left padding");

  const dragHandle = blockFor(".drag-handle");
  assert.match(dragHandle, /opacity:\s*0\.42;/, "Budget drag handle should be visually secondary by default");
  assert.match(dragHandle, /font-size:\s*0\.72rem;/, "Budget drag handle icon should be smaller than category text");

  const activeDragHandle = blockFor(".drag-handle-active");
  assert.match(activeDragHandle, /width:\s*0\.9rem;/, "Budget drag affordance should use a compact width");
  assert.match(activeDragHandle, /height:\s*1\.35rem;/, "Budget drag affordance should align as a subtle row marker");

  console.log("v2.60.12 budget drag handle polish checks passed");
}

run();
