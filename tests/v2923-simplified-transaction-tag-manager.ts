import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const managerSource = readFileSync(
  "apps/web/src/features/tags/TransactionTagManager.tsx",
  "utf8",
);

const colourValues = Array.from(
  managerSource.matchAll(/\{ value: "([^"]+)", label: "[^"]+" \}/g),
  (match) => match[1],
);

assert.deepEqual(colourValues, [
  "red",
  "gray",
  "orange",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "purple",
  "pink",
  "brown",
  "slate",
  "black",
]);

assert.match(managerSource, /\+ Add tag/);
assert.match(managerSource, /Search tags/);
assert.match(managerSource, /onBlur=\{\(event\) =>/);
assert.match(managerSource, /service\.updateTag/);
assert.doesNotMatch(managerSource, />Archive</);
assert.doesNotMatch(managerSource, />Restore</);
assert.doesNotMatch(managerSource, />Edit</);
assert.doesNotMatch(managerSource, /Save changes/);

console.log("v2.92.3 simplified transaction tag manager checks passed");
