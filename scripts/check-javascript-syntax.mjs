import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const roots = ["apps/server/src", "scripts"];
const extensions = new Set([".js", ".mjs", ".cjs"]);

function collect(path) {
  const files = [];

  for (const entry of readdirSync(resolve(path), { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;

    if (entry.isDirectory()) {
      files.push(...collect(child));
    } else if (entry.isFile() && extensions.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      files.push(child);
    }
  }

  return files;
}

const files = roots.flatMap(collect).sort((a, b) => a.localeCompare(b));

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    console.error(`Unable to check ${file}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`${files.length} JavaScript files passed syntax checking.`);
