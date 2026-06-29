import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const css = readFileSync("apps/web/src/styles/register.css", "utf8");

assert.match(
  page,
  /registerLayoutMode === "compact" \? \(/,
  "register should render a dedicated compact column header instead of hiding headings",
);

assert.match(
  page,
  /Payee \/ Category \/ Memo/,
  "compact register header should label the combined transaction detail column",
);

assert.match(
  page,
  /Amount \/ Balance/,
  "compact register header should label the combined amount and balance column",
);

assert.match(
  page,
  /<Paperclip size=\{13\} aria-hidden="true" \/>/,
  "compact register header should include an attachment paperclip column",
);

assert.match(
  css,
  /\.register-layout-compact \.register-head-compact \{[\s\S]*display: grid;/,
  "compact register header should be displayed as a grid",
);

assert.match(
  css,
  /\.register-layout-compact \.register-head-compact \{[\s\S]*position: sticky;/,
  "compact register header should inherit sticky header behaviour",
);

assert.match(
  css,
  /\.register-layout-tablet \.register-head \{\s*display: none;/,
  "tablet/card register layout should keep using card-style rows without a table header",
);

console.log("v2.35.0 register column header checks passed");
