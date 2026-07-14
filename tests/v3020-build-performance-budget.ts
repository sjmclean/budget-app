import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const viteConfig = readFileSync("apps/web/vite.config.ts", "utf8");
const rootPackage = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts?: Record<string, string>;
};
const analyzer = readFileSync(
  "tools/performance/analyze-vite-build.ts",
  "utf8",
);
const budgets = JSON.parse(
  readFileSync("tools/performance/vite-performance-budget.json", "utf8"),
) as Record<string, number>;

assert(
  /manifest:\s*true/.test(viteConfig),
  "Vite builds must emit a manifest for performance analysis",
);
assert(
  /chunkSizeWarningLimit:\s*650/.test(viteConfig),
  "Vite should warn when a generated chunk exceeds the agreed threshold",
);

assert(
  rootPackage.scripts?.["performance:analyze"] ===
    "tsx tools/performance/analyze-vite-build.ts",
  "package.json must expose the Vite performance analyzer",
);
assert(
  rootPackage.scripts?.["build:performance"] ===
    "pnpm --filter @budget-app/web build && pnpm performance:analyze",
  "package.json must expose a build-and-analyze workflow",
);

for (const expected of [
  "initialJavaScriptBytes",
  "initialCssBytes",
  "largestAsyncJavaScriptBytes",
  "totalJavaScriptBytes",
  "totalCssBytes",
]) {
  assert(
    typeof budgets[expected] === "number" && budgets[expected] > 0,
    `performance budget ${expected} must be a positive number`,
  );
}

for (const expected of [
  '".vite/manifest.json"',
  "collectStaticGraph",
  "gzipSync",
  "performance-report.json",
  "largestAsyncChunks",
]) {
  assert(
    analyzer.includes(expected),
    `performance analyzer must retain ${expected}`,
  );
}

assert(
  analyzer.includes("actual > check.budget"),
  "performance analyzer must fail when a budget is exceeded",
);

console.log("v3.02 build performance budget regression tests passed");
