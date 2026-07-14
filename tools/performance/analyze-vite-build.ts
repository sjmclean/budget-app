import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface ManifestChunk {
  file: string;
  src?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
}

interface PerformanceBudgets {
  initialJavaScriptBytes: number;
  initialCssBytes: number;
  largestAsyncJavaScriptBytes: number;
  totalJavaScriptBytes: number;
  totalCssBytes: number;
}

interface AssetMeasurement {
  file: string;
  bytes: number;
  gzipBytes: number;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const webDistDirectory = join(repositoryRoot, "apps/web/dist");
const manifestPath = join(webDistDirectory, ".vite/manifest.json");
const budgetPath = join(scriptDirectory, "vite-performance-budget.json");
const reportPath = join(webDistDirectory, "performance-report.json");

function fail(message: string): never {
  throw new Error(`[performance-budget] ${message}`);
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function measureAsset(file: string): AssetMeasurement {
  const absolutePath = join(webDistDirectory, file);

  if (!existsSync(absolutePath)) {
    fail(`Manifest asset does not exist: ${file}`);
  }

  const contents = readFileSync(absolutePath);

  return {
    file,
    bytes: statSync(absolutePath).size,
    gzipBytes: gzipSync(contents).length,
  };
}

function collectStaticGraph(
  manifest: Record<string, ManifestChunk>,
  rootKey: string,
): Set<string> {
  const visited = new Set<string>();

  function visit(key: string) {
    if (visited.has(key)) {
      return;
    }

    const chunk = manifest[key];

    if (!chunk) {
      fail(`Manifest references an unknown chunk: ${key}`);
    }

    visited.add(key);

    for (const importedKey of chunk.imports ?? []) {
      visit(importedKey);
    }
  }

  visit(rootKey);
  return visited;
}

function unique(values: Iterable<string>): string[] {
  return Array.from(new Set(values));
}

if (!existsSync(manifestPath)) {
  fail(
    `Vite manifest was not found at ${manifestPath}. Run "pnpm --filter @budget-app/web build" first.`,
  );
}

const manifest = JSON.parse(
  readFileSync(manifestPath, "utf8"),
) as Record<string, ManifestChunk>;
const budgets = JSON.parse(
  readFileSync(budgetPath, "utf8"),
) as PerformanceBudgets;

const entry = Object.entries(manifest).find(([, chunk]) => chunk.isEntry);

if (!entry) {
  fail("The Vite manifest does not contain an application entry chunk.");
}

const [entryKey] = entry;
const initialChunkKeys = collectStaticGraph(manifest, entryKey);
const initialJavaScriptFiles = unique(
  Array.from(initialChunkKeys, (key) => manifest[key].file),
);
const initialCssFiles = unique(
  Array.from(initialChunkKeys).flatMap((key) => manifest[key].css ?? []),
);

const allJavaScriptFiles = unique(
  Object.values(manifest)
    .map((chunk) => chunk.file)
    .filter((file) => file.endsWith(".js")),
);
const allCssFiles = unique(
  Object.values(manifest).flatMap((chunk) => chunk.css ?? []),
);

const initialJavaScript = initialJavaScriptFiles.map(measureAsset);
const initialCss = initialCssFiles.map(measureAsset);
const allJavaScript = allJavaScriptFiles.map(measureAsset);
const allCss = allCssFiles.map(measureAsset);

const asyncChunks = Object.entries(manifest)
  .filter(([key, chunk]) => !initialChunkKeys.has(key) && chunk.file.endsWith(".js"))
  .map(([key, chunk]) => ({
    key,
    src: chunk.src ?? key,
    ...measureAsset(chunk.file),
  }))
  .sort((left, right) => right.bytes - left.bytes);

const sumBytes = (assets: AssetMeasurement[]) =>
  assets.reduce((total, asset) => total + asset.bytes, 0);
const sumGzipBytes = (assets: AssetMeasurement[]) =>
  assets.reduce((total, asset) => total + asset.gzipBytes, 0);

const measurements = {
  initialJavaScriptBytes: sumBytes(initialJavaScript),
  initialJavaScriptGzipBytes: sumGzipBytes(initialJavaScript),
  initialCssBytes: sumBytes(initialCss),
  initialCssGzipBytes: sumGzipBytes(initialCss),
  largestAsyncJavaScriptBytes: asyncChunks[0]?.bytes ?? 0,
  totalJavaScriptBytes: sumBytes(allJavaScript),
  totalJavaScriptGzipBytes: sumGzipBytes(allJavaScript),
  totalCssBytes: sumBytes(allCss),
  totalCssGzipBytes: sumGzipBytes(allCss),
};

const checks = [
  {
    name: "Initial JavaScript",
    actual: measurements.initialJavaScriptBytes,
    budget: budgets.initialJavaScriptBytes,
  },
  {
    name: "Initial CSS",
    actual: measurements.initialCssBytes,
    budget: budgets.initialCssBytes,
  },
  {
    name: "Largest async JavaScript chunk",
    actual: measurements.largestAsyncJavaScriptBytes,
    budget: budgets.largestAsyncJavaScriptBytes,
  },
  {
    name: "Total JavaScript",
    actual: measurements.totalJavaScriptBytes,
    budget: budgets.totalJavaScriptBytes,
  },
  {
    name: "Total CSS",
    actual: measurements.totalCssBytes,
    budget: budgets.totalCssBytes,
  },
];

const failures = checks.filter((check) => check.actual > check.budget);

const report = {
  generatedAt: new Date().toISOString(),
  entryKey,
  budgets,
  measurements,
  checks: checks.map((check) => ({
    ...check,
    passed: check.actual <= check.budget,
  })),
  initialAssets: {
    javascript: initialJavaScript,
    css: initialCss,
  },
  largestAsyncChunks: asyncChunks.slice(0, 10),
};

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("\nVite performance budget");
console.log("=======================");
for (const check of checks) {
  const status = check.actual <= check.budget ? "PASS" : "FAIL";
  console.log(
    `${status.padEnd(4)} ${check.name.padEnd(32)} ${formatBytes(check.actual).padStart(12)} / ${formatBytes(check.budget)}`,
  );
}

console.log("\nCompressed entry footprint");
console.log(
  `JavaScript: ${formatBytes(measurements.initialJavaScriptGzipBytes)} gzip`,
);
console.log(`CSS:        ${formatBytes(measurements.initialCssGzipBytes)} gzip`);

if (asyncChunks.length > 0) {
  console.log("\nLargest lazy chunks");
  for (const chunk of asyncChunks.slice(0, 8)) {
    console.log(
      `${formatBytes(chunk.bytes).padStart(12)} (${formatBytes(chunk.gzipBytes)} gzip)  ${chunk.src}`,
    );
  }
}

console.log(`\nReport: ${reportPath}`);

if (failures.length > 0) {
  fail(
    failures
      .map(
        (failure) =>
          `${failure.name} is ${formatBytes(failure.actual)}, above ${formatBytes(failure.budget)}`,
      )
      .join("; "),
  );
}
