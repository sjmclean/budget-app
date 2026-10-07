import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { findMerchantIconByPayeeName, preloadExtendedMerchantIconCatalogue } from "../../../apps/web/src/features/icons/merchantIconCatalogue.js";

const ignoredDirectories = new Set(["node_modules", "dist", "build", "coverage", "test-results", "playwright-report", ".git"]);

function walk(root: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(root)) {
    if (ignoredDirectories.has(name)) continue;
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

test("behavioural tests use synthetic payees rather than real catalogue merchants", async () => {
  await preloadExtendedMerchantIconCatalogue();
  const violations: string[] = [];
  const payeeLiteral = /\bpayee\s*:\s*["'`]([^"'`$]+)["'`]/gu;

  for (const path of walk("tests")) {
    if (!/\.(?:ts|tsx)$/iu.test(path)) continue;
    if (path.includes("merchant-icon") || path.endsWith("payee-icons-phase1a.test.ts")) continue;
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


test("repository fixtures do not contain obvious personal identifiers or local-user paths", () => {
  const violations: string[] = [];
  const emailPattern = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/giu;
  const homePatterns = [
    /(?:^|["'\s])\/Users\/([^/"'\s]+)\//gu,
    /(?:^|["'\s])\/home\/([^/"'\s]+)\//gu,
    /(?:^|["'\s])[A-Z]:\\\\Users\\\\([^\\\\/"'\s]+)\\\\/giu,
  ];
  const sensitiveAssignments = [
    /\b(?:accountNumber|cardNumber|routingNumber|bsb)\b\s*[:=]\s*["'`]([0-9][0-9 -]{5,})["'`]/giu,
    /<(?:ACCTID|BANKID|ROUTINGNUM)>\s*([0-9][0-9 -]{5,})/giu,
  ];

  for (const root of ["apps", "tests", "tools", "docs"]) {
    for (const filePath of walk(root)) {
      if (!textExtensions.test(filePath) || filePath.endsWith("repository-personal-data-hygiene.test.ts")) continue;
      const source = readFileSync(filePath, "utf8");

      for (const match of source.matchAll(emailPattern)) {
        const domain = match[1]!.toLocaleLowerCase();
        const tld = domain.split(".").at(-1) ?? "";
        if (!["example.com", "example.org", "example.net", "example.test", "localhost"].includes(domain)
          && !["png", "jpg", "jpeg", "svg", "webp", "gif", "ico"].includes(tld)) {
          violations.push(`${filePath}: non-example email ${match[0]}`);
        }
      }

      for (const pattern of homePatterns) {
        for (const match of source.matchAll(pattern)) {
          const user = match[1]!.toLocaleLowerCase();
          if (!["runner", "root", "user", "example", "developer"].includes(user)) {
            violations.push(`${filePath}: local user path for ${match[1]}`);
          }
        }
      }

      for (const pattern of sensitiveAssignments) {
        for (const match of source.matchAll(pattern)) {
          violations.push(`${filePath}: sensitive financial identifier ${match[1]}`);
        }
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("import-style fixtures do not embed real catalogue merchant payees", async () => {
  await preloadExtendedMerchantIconCatalogue();
  const violations: string[] = [];

  function checkPayee(filePath: string, payee: string) {
    const value = payee.trim().replace(/^["']|["']$/gu, "");
    if (!value || /^example\b/iu.test(value) || value.startsWith("Transfer:")) return;
    const merchant = findMerchantIconByPayeeName(value, "AU");
    if (merchant) violations.push(`${filePath}: "${value}" resolves to ${merchant.key}`);
  }

  for (const filePath of walk("tests")) {
    if (!textExtensions.test(filePath) || filePath.endsWith("repository-personal-data-hygiene.test.ts")) continue;
    const source = readFileSync(filePath, "utf8");

    for (const match of source.matchAll(/^P([^\r\n]+)$/gmu)) checkPayee(filePath, match[1]!);
    for (const match of source.matchAll(/<NAME>\s*([^<\r\n]+)/giu)) checkPayee(filePath, match[1]!);
    for (const match of source.matchAll(/<PAYEE>\s*([^<\r\n]+)/giu)) checkPayee(filePath, match[1]!);

    for (const line of source.split(/\r?\n/u)) {
      if (!line.includes(",")) continue;
      const columns = line.split(",");
      if (columns.length >= 2 && /^\s*\d{4}-\d{2}-\d{2}\s*$/u.test(columns[0] ?? "")) {
        checkPayee(filePath, columns[1] ?? "");
      }
    }
  }

  assert.deepEqual(violations, []);
});
