import { readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const roots = process.argv.slice(2);
const searchRoots = roots.length > 0 ? roots : ["tests"];

function collect(path) {
  const absolute = resolve(path);

  if (statSync(absolute).isFile()) {
    return absolute.endsWith(".test.ts") ? [path] : [];
  }

  const files = [];

  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;

    if (entry.isDirectory()) {
      files.push(...collect(child));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(child);
    }
  }

  return files;
}

const tests = searchRoots
  .flatMap(collect)
  .sort((a, b) => a.localeCompare(b));

if (tests.length === 0) {
  console.error(`No *.test.ts files found under: ${searchRoots.join(", ")}`);
  process.exit(1);
}

let passed = 0;

for (const test of tests) {
  const result = spawnSync(
    "pnpm",
    ["exec", "tsx", test],
    {
      stdio: "inherit",
      shell: false,
    },
  );

  if (result.error) {
    console.error(`FAIL ${test}`);
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`FAIL ${test} [exit=${result.status}]`);
    process.exit(result.status ?? 1);
  }

  passed += 1;
}

console.log(`\n${passed}/${tests.length} test files passed.`);
