import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRuntimeUuid } from "../apps/web/src/features/ids/createRuntimeUuid.js";

const native = createRuntimeUuid({
  randomUUID: () => "11111111-1111-4111-8111-111111111111",
});
assert.equal(native, "11111111-1111-4111-8111-111111111111");

const values = Uint8Array.from({ length: 16 }, (_, index) => index);
const webCryptoFallback = createRuntimeUuid({
  randomUUID: undefined,
  getRandomValues(array) {
    array.set(values);
    return array;
  },
});
assert.match(
  webCryptoFallback,
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
);

const minimalRuntimeFallback = createRuntimeUuid({});
assert.match(
  minimalRuntimeFallback,
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
);

const accountHook = readFileSync(
  "apps/web/src/features/accounts/useAccountRegister.ts",
  "utf8",
);
assert.doesNotMatch(accountHook, /id:\s*crypto\.randomUUID\(\)/);
assert.match(accountHook, /id:\s*createRuntimeUuid\(\)/);

console.log("Runtime UUID compatibility passed without crypto.randomUUID.");
