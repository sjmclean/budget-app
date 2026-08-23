import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  beginMoneyInputEdit,
  cancelMoneyInputEdit,
  changeMoneyInputDraft,
  commitMoneyInputEdit,
  createMoneyInputSession,
  synchroniseMoneyInputValue,
} from "../../../apps/web/src/features/money/moneyInputLifecycle.ts";

const format = (value: number) => value.toFixed(2);

test("successful Enter-style commits end the session and use the next committed base", () => {
  let session = beginMoneyInputEdit(createMoneyInputSession(90, "90.00"), 90, "90.00");
  session = changeMoneyInputDraft(session, "+1");
  const first = commitMoneyInputEdit(session, format);
  assert.equal(first.committedValue, 91);
  assert.deepEqual(first.session, {
    mode: "idle",
    baseValue: 91,
    draft: "91.00",
    hasError: false,
  });

  session = beginMoneyInputEdit(first.session, 91, "91.00");
  session = changeMoneyInputDraft(session, "+1");
  const second = commitMoneyInputEdit(session, format);
  assert.equal(second.committedValue, 92);
  assert.equal(second.session.mode, "idle");
});

test("invalid blur preserves its draft through refocus and correction", () => {
  let session = beginMoneyInputEdit(createMoneyInputSession(90, "90.00"), 90, "90.00");
  session = changeMoneyInputDraft(session, "10/");
  const invalid = commitMoneyInputEdit(session, format, undefined, "invalid-pending");
  assert.equal(invalid.committedValue, undefined);
  assert.equal(invalid.session.mode, "invalid-pending");
  assert.equal(invalid.session.draft, "10/");
  assert.equal(invalid.session.hasError, true);

  session = beginMoneyInputEdit(invalid.session, 90, "90.00");
  assert.equal(session.draft, "10/");
  session = changeMoneyInputDraft(session, "10/2");
  const corrected = commitMoneyInputEdit(session, format);
  assert.equal(corrected.committedValue, 5);
  assert.deepEqual(corrected.session, {
    mode: "idle",
    baseValue: 5,
    draft: "5.00",
    hasError: false,
  });
});

test("Escape restores the latest committed value and clears pending errors", () => {
  let session = beginMoneyInputEdit(createMoneyInputSession(90, "90.00"), 90, "90.00");
  session = changeMoneyInputDraft(session, "10/");
  session = commitMoneyInputEdit(session, format, undefined, "invalid-pending").session;
  session = synchroniseMoneyInputValue(session, 100, "100.00");
  assert.equal(session.draft, "10/", "an external update must not overwrite a pending invalid draft");
  assert.equal(session.baseValue, 100);
  assert.deepEqual(cancelMoneyInputEdit(100, "100.00"), {
    mode: "idle",
    baseValue: 100,
    draft: "100.00",
    hasError: false,
  });
});

test("idle external updates synchronise after blur or Enter", () => {
  const idle = createMoneyInputSession(90, "90.00");
  assert.deepEqual(synchroniseMoneyInputValue(idle, 100, "100.00"), {
    mode: "idle",
    baseValue: 100,
    draft: "100.00",
    hasError: false,
  });

  let session = beginMoneyInputEdit(idle, 90, "90.00");
  session = changeMoneyInputDraft(session, "+1");
  session = commitMoneyInputEdit(session, format).session;
  assert.equal(session.mode, "idle");
  assert.equal(synchroniseMoneyInputValue(session, 95, "95.00").draft, "95.00");
});

test("MoneyInput suppresses the programmatic blur after Enter instead of committing twice", () => {
  const source = readFileSync(
    new URL("../../../apps/web/src/features/money/MoneyInput.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /if \(commit\("editing"\)\) \{\s*suppressNextBlur\.current = true;\s*event\.currentTarget\.blur\(\);/);
  assert.match(source, /if \(suppressNextBlur\.current\) \{\s*suppressNextBlur\.current = false;\s*return;/);
  assert.doesNotMatch(source, /cancelled/);
});
