import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const SOURCE_ROOT = "apps/web/src";
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const IGNORED_DIRECTORY_NAMES = new Set(["node_modules", "dist", "build"]);

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    if (IGNORED_DIRECTORY_NAMES.has(name)) {
      return [];
    }

    const path = join(directory, name);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      return collectSourceFiles(path);
    }

    return SOURCE_EXTENSIONS.has(extname(path)) ? [path] : [];
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const tableLayoutPath =
  "apps/web/src/features/tableLayout/tableLayout.ts";
const tableLayout = readFileSync(tableLayoutPath, "utf8");

assert.match(
  tableLayout,
  /const EMPTY_COLUMN_ID_ALIASES:[\s\S]*Object\.freeze\(\{\}\)/,
  "table layout should use one stable immutable empty alias map",
);
assert.doesNotMatch(
  tableLayout,
  /columnIdAliases\s*=\s*\{\}/,
  "useTableLayout must not allocate a default alias object during render",
);
assert.match(
  tableLayout,
  /columnIdAliases\s*\?\?\s*EMPTY_COLUMN_ID_ALIASES/,
  "useTableLayout should resolve omitted aliases to the stable shared map",
);
assert.match(
  tableLayout,
  /\[[^\]]*resolvedColumnIdAliases[^\]]*\]/,
  "the table layout effect should depend on the stable resolved alias map",
);

const violations: string[] = [];

for (const path of collectSourceFiles(SOURCE_ROOT)) {
  const source = readFileSync(path, "utf8");

  const hookPattern =
    /(?:export\s+)?function\s+(use[A-Z]\w*)\s*(?:<[\s\S]*?>)?\s*\(([\s\S]*?)\)\s*(?::[^{]+)?\{/g;

  for (const hookMatch of source.matchAll(hookPattern)) {
    const hookName = hookMatch[1];
    const parameters = hookMatch[2];
    const hookBodyStart = (hookMatch.index ?? 0) + hookMatch[0].length;
    const followingSource = source.slice(hookBodyStart);
    const nextHookIndex = followingSource.search(
      /(?:export\s+)?function\s+use[A-Z]\w*/,
    );
    const hookBody =
      nextHookIndex >= 0
        ? followingSource.slice(0, nextHookIndex)
        : followingSource;

    const mutableDefaultPattern =
      /\b([A-Za-z_$][\w$]*)\s*=\s*(\{\}|\[\]|new\s+(?:Map|Set)\s*\(\s*\))/g;

    for (const defaultMatch of parameters.matchAll(mutableDefaultPattern)) {
      const parameterName = defaultMatch[1];
      const dependencyArrayPattern = new RegExp(
        String.raw`\[[^\]]*(?:^|,)\s*${escapeRegExp(parameterName)}\s*(?:,|\])`,
        "m",
      );

      if (dependencyArrayPattern.test(hookBody)) {
        violations.push(
          `${relative(".", path)}: ${hookName} uses mutable default ${parameterName} directly in a dependency array`,
        );
      }
    }
  }
}

assert.deepEqual(
  violations,
  [],
  `unstable mutable hook defaults found:\n${violations.join("\n")}`,
);

console.log("v2.94.0 React hook stability audit passed");
