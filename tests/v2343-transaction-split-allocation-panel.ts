import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const page = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const css = readFileSync("apps/web/src/styles/register.css", "utf8");

assert(
  page.includes("register-split-allocation-panel"),
  "split editor should render the allocation panel class",
);
assert(
  page.includes("Split allocation"),
  "split editor should label the allocation panel",
);
assert(
  page.includes("register-split-allocation-category"),
  "split editor should give category its own allocation field",
);
assert(
  page.includes("register-split-allocation-memo"),
  "split editor should keep memo as a secondary allocation field",
);
assert(
  page.includes("register-split-allocation-amount"),
  "split editor should use compact amount fields",
);
assert(
  css.includes("grid-template-columns: 3.6rem minmax(14rem, 1.7fr) minmax(8rem, 0.85fr)"),
  "desktop split allocation grid should prioritise category over memo",
);
assert(
  css.includes("overflow-x: auto") && css.includes("min-width: 43rem"),
  "split allocation panel should keep a stable grid and scroll at narrower widths",
);
assert(
  !css.includes("grid-template-areas"),
  "split allocation panel should not use the broken two-line wrapped grid",
);

console.log("v2.34.3 transaction split allocation panel checks passed");
