import { readFileSync } from "node:fs";
import { compareSqliteImages } from "./sqlitePageDiff";

const [before, after, ...extra] = process.argv.slice(2);
if (!before || !after || extra.length) {
  console.error("Usage: pnpm tsx tools/performance/sqlite-page-diff.ts before.sqlite after.sqlite");
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(compareSqliteImages(readFileSync(before), readFileSync(after)), null, 2));
}
