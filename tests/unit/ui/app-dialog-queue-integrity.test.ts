import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const provider = readFileSync(
  new URL("../../../apps/web/src/features/ui/AppDialogsProvider.tsx", import.meta.url),
  "utf8",
);

test("dialog queues use synchronous active refs instead of side effects inside state updaters", () => {
  assert.match(provider, /activeConfirmRef = useRef<ActiveConfirmDialog \| null>\(null\)/);
  assert.match(provider, /activePromptRef = useRef<ActivePromptDialog \| null>\(null\)/);
  assert.match(provider, /activePromptRef\.current = next;\s*setPromptValue\(next\.request\.initialValue \?\? ""\);\s*setActivePrompt\(next\)/s);
  assert.match(provider, /activeConfirmRef\.current = next;\s*setActiveConfirm\(next\)/s);
  assert.doesNotMatch(provider, /setActivePrompt\(\(current\) =>[\s\S]*?setPromptValue/);
  assert.doesNotMatch(provider, /setActiveConfirm\(\(current\) =>/);
});

test("dialog resolution releases queue ownership before scheduling the next request", () => {
  assert.match(
    provider,
    /activePromptRef\.current = null;\s*current\.resolve\(value\);\s*setActivePrompt\(null\);/s,
  );
  assert.match(
    provider,
    /activeConfirmRef\.current = null;\s*current\.resolve\(confirmed\);\s*setActiveConfirm\(null\);/s,
  );
});
