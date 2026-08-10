import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const vite = readFileSync("apps/web/vite.config.ts", "utf8");
const setup = readFileSync("scripts/setup-dev-https.sh", "utf8");
const ignore = readFileSync(".gitignore", "utf8");

assert.match(vite, /budget-app-dev\.crt/);
assert.match(vite, /budget-app-dev\.key/);
assert.match(vite, /server:\s*\{[\s\S]*https,/);
assert.match(vite, /preview:\s*\{[\s\S]*https,/);
assert.match(setup, /subjectAltName=\$PRIMARY_SAN,DNS:localhost,IP:127\.0\.0\.1/);
assert.match(setup, /Budget App Development CA/);
assert.match(ignore, /^\.certs\/$/m);

console.log("Milestone 4 secure local development configuration passed.");
