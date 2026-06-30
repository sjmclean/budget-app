import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const css = readFileSync("apps/web/src/styles/register.css", "utf8");

assert.match(
  page,
  /<div className="register-sticky-stack">[\s\S]*<section className="register-clean-header">/,
  "account name and balance should be inside the sticky register stack",
);

assert.match(
  page,
  /<div className="register-sticky-stack">[\s\S]*register-toolbar register-toolbar-clean/,
  "register toolbar should be inside the sticky register stack",
);

assert.match(
  page,
  /<div className="register-sticky-stack">[\s\S]*\{registerColumnHeader\}/,
  "register column header should be inside the sticky register stack",
);

assert.match(
  page,
  /const registerColumnHeader =/,
  "register column header should be rendered from a shared header variable",
);

assert.match(
  css,
  /\.register-sticky-stack \{[\s\S]*position: sticky;[\s\S]*top: 0;/,
  "register sticky stack should stick to the top of the viewport",
);

assert.match(
  css,
  /\.register-sticky-stack \.register-head,[\s\S]*\.register-layout-compact \.register-sticky-stack \.register-head-compact \{[\s\S]*position: static;/,
  "column headers should not create a second independent sticky layer inside the stack",
);

assert.match(
  page,
  /<div className="register-table">\s*\{showEntryRow && \(/,
  "transaction rows should begin after the sticky stack, not with another header row",
);

console.log("v2.35.1 sticky register header stack checks passed");
