import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { findMerchantIconByPayeeName } from "../../../apps/web/src/features/icons/merchantIconCatalogue.js";

function walk(root: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

const textExtensions = /\.(?:ts|tsx|js|mjs|cjs|json|md|txt|csv|qif|ofx)$/iu;

test("repository has no personal merchant-source artifacts or provenance markers", () => {
  const forbidden = [
    ["user", "seed"].join("-"),
    ["user", "supplied"].join("-"),
    ["user", "top", "100", "merchant", "history"].join("-"),
    ["expansion", "2", "user", "history", "priority"].join("-"),
    ["original user", "supplied catalogue"].join("-"),
  ];

  const matches: string[] = [];
  for (const root of ["apps", "tests", "tools", "docs"]) {
    for (const path of walk(root)) {
      if (!textExtensions.test(path) || path.endsWith("repository-personal-data-hygiene.test.ts")) continue;
      const source = readFileSync(path, "utf8").toLocaleLowerCase();
      for (const marker of forbidden) {
        if (source.includes(marker.toLocaleLowerCase())) matches.push(`${path}: ${marker}`);
      }
    }
  }

  assert.deepEqual(matches, []);
});

test("behavioural tests use synthetic payees rather than real catalogue merchants", () => {
  const violations: string[] = [];
  const payeeLiteral = /\bpayee\s*:\s*["'`]([^"'\`$]+)["'`]/gu;

  for (const path of walk("tests")) {
    if (!/\.(?:ts|tsx)$/iu.test(path)) continue;
    if (path.includes("merchant-icon")) continue;
    if (path.endsWith("repository-personal-data-hygiene.test.ts")) continue;

    const source = readFileSync(path, "utf8");
    let match: RegExpExecArray | null;
    while ((match = payeeLiteral.exec(source)) !== null) {
      const payee = match[1]!.trim();
      if (!payee || payee.startsWith("Transfer:")) continue;
      const merchant = findMerchantIconByPayeeName(payee, "AU");
      if (merchant) violations.push(`${path}: "${payee}" resolves to ${merchant.key}`);
    }
  }

  assert.deepEqual(violations, []);
});
