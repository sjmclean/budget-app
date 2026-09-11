import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readPackage = (path: string) => JSON.parse(readFileSync(path, "utf8")) as {
  private?: boolean;
  version?: string;
};

test("the root manifest is the sole Budget App product-version source", () => {
  const root = readPackage("package.json");
  assert.match(root.version ?? "", /^\d+\.\d+\.\d+$/, "root must declare the product version");
  for (const path of ["apps/web/package.json", "apps/server/package.json"]) {
    const child = readPackage(path);
    assert.equal(child.private, true, `${path} must remain private`);
    assert.equal(child.version, undefined, `${path} must not declare an independent product version`);
  }
});
