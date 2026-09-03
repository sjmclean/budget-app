import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rowSource = readFileSync("apps/web/src/features/accounts/components/TransactionRow.tsx", "utf8");
const pageSource = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const globals = readFileSync("apps/web/src/styles/globals.css", "utf8");
const register = readFileSync("apps/web/src/styles/register.css", "utf8");

test("register rows use the existing decorative PayeeIcon renderer without parsing icon refs", () => {
  assert.match(rowSource, /import \{ PayeeIcon \} from "\.\.\/\.\.\/icons\/PayeeIcon"/);
  assert.equal(rowSource.match(/canonicalPayee \? <PayeeIcon payee=\{canonicalPayee\} size=\{24\} decorative \/> : null/g)?.length, 4);
  assert.doesNotMatch(rowSource, /<PayeeIcon[^>]*size=\{20\}/);
  assert.doesNotMatch(rowSource, /parsePayeeIconReference|resolvePayeeIcon|listPayees/);
  assert.match(rowSource, /<strong>\{transaction\.payee\}<\/strong>/);
});

function rule(css: string, selector: string): string {
  const block = css.split("}").find((part) => part.split("{")[0].split(",").some((value) => value.trim().endsWith(selector)));
  assert.ok(block, `missing CSS rule: ${selector}`);
  return block.slice(block.indexOf("{") + 1);
}

test("icon-present register wrappers stay horizontal, including the later desktop grid override", () => {
  for (const name of ["register-payee-cell", "register-compact-payee-line", "register-tablet-payee-line"]) {
    assert.match(rule(globals, `.${name}:has(> .payee-icon)`), /flex-wrap:\s*nowrap/);
  }
  assert.match(rule(register, ".register-payee-cell:has(> .payee-icon)"), /display:\s*flex/);
  assert.match(rule(register, ".register-mobile-payee-wrap:has(> .payee-icon)"), /flex-wrap:\s*nowrap/);
  for (const name of ["register-payee-cell", "register-compact-payee-line", "register-tablet-payee-line"]) {
    const text = rule(globals, `.${name} strong`);
    for (const declaration of ["min-width: 0", "overflow: hidden", "text-overflow: ellipsis", "white-space: nowrap"]) assert.ok(text.includes(declaration));
  }
  assert.match(rule(register, ".register-mobile-payee"), /text-overflow:\s*ellipsis/);
});

test("24px space belongs only to rendered icons; icons-OFF retains the desktop grid", () => {
  for (const name of ["register-payee-cell", "register-compact-payee-line", "register-tablet-payee-line", "register-mobile-payee-wrap"]) {
    assert.match(rule(globals, `.${name} > .payee-icon`), /flex:\s*0 0 24px/);
  }
  assert.match(rule(register, ".register-payee-cell"), /display:\s*grid/);
});

test("register builds one payee ID lookup and resolves rows without persistence reads", () => {
  assert.match(pageSource, /new Map\(allManagedPayees\.map\(\(payee\) => \[payee\.id, payee\]\)\)/);
  assert.match(pageSource, /resolveRegisterPayee\(registerPayeesById, transaction\)/);
  assert.doesNotMatch(pageSource, /transaction\.(payeeIcon|iconRef|merchantLogo|payeeImage)/);
});
