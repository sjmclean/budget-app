import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildScheduledPreview,
  buildScheduledPreviewColumnPlan,
  getScheduledPreviewRelativeLabel,
  readScheduledPreviewDays,
  SCHEDULED_PREVIEW_DAYS_KEY,
  writeScheduledPreviewDays,
} from "../../../apps/web/src/features/accounts/scheduledTransactionPreview";
import type { ScheduledTransactionView } from "../../../apps/web/src/features/accounts/scheduledTransactionTypes";
import { REGISTER_COLUMN_DEFINITIONS } from "../../../apps/web/src/features/accounts/registerColumns";
import {
  createFixedBudgetScopedStorage,
  getBudgetScopedStorageKey,
  isBudgetScopedStorageKey,
} from "../../../apps/web/src/features/budget/budgetDataScope";

const schedule = (id: string, date: string) =>
  ({
    id,
    accountId: "a",
    nextDueDate: date,
    frequency: "once",
    payee: id,
    category: "",
    outflow: 1,
    inflow: 0,
    createdAt: "",
    updatedAt: "",
  }) as ScheduledTransactionView;

test("preview horizons include overdue and boundary dates, exclude later dates, and sort deterministically", () => {
  const values = [
    schedule("z", "2026-09-01"),
    schedule("b", "2026-09-12"),
    schedule("a", "2026-09-12"),
    schedule("later", "2026-10-06"),
  ];
  for (const [days, boundary] of [
    [3, "2026-09-08"],
    [7, "2026-09-12"],
    [14, "2026-09-19"],
    [30, "2026-10-05"],
  ] as const) {
    const result = buildScheduledPreview(
      [...values, schedule(`edge-${days}`, boundary)],
      "2026-09-05",
      days,
    );
    assert.ok(result.items.some((item) => item.id === "z"));
    assert.ok(result.items.some((item) => item.id === `edge-${days}`));
    assert.ok(!result.items.some((item) => item.id === "later"));
  }
  assert.deepEqual(
    buildScheduledPreview(values, "2026-09-05", 7).items.map((item) => item.id),
    ["z", "a", "b"],
  );
});
test("preview caps visible items at five and reports remainder", () => {
  const result = buildScheduledPreview(
    Array.from({ length: 8 }, (_, index) =>
      schedule(String(index), "2026-09-06"),
    ),
    "2026-09-05",
    7,
  );
  assert.equal(result.items.length, 5);
  assert.equal(result.total, 8);
  assert.equal(result.remaining, 3);
});

test("relative labels use local calendar boundaries without an overdue state", () => {
  const today = "2026-12-30";
  assert.equal(getScheduledPreviewRelativeLabel("2026-12-30", today), "Today");
  assert.equal(getScheduledPreviewRelativeLabel("2026-12-31", today), "Tomorrow");
  assert.equal(getScheduledPreviewRelativeLabel("2027-01-01", today), "In 2 days");
  assert.equal(getScheduledPreviewRelativeLabel("2027-01-02", today), "In 3 days");
  assert.equal(getScheduledPreviewRelativeLabel("2027-01-03", today), "Scheduled");
  assert.equal(getScheduledPreviewRelativeLabel("2026-12-29", today), "Scheduled");
});

test("desktop ghost-column plan follows active visibility and preserves actions", () => {
  const defaultColumnIds = REGISTER_COLUMN_DEFINITIONS.map((column) => column.id);
  assert.deepEqual(
    buildScheduledPreviewColumnPlan(defaultColumnIds).columnIds,
    defaultColumnIds,
  );

  const withoutOptionalColumns = buildScheduledPreviewColumnPlan([
    "select",
    "date",
    "payee",
    "category",
    "memo",
    "checkNumber",
    "amount",
    "status",
  ]);
  assert.deepEqual(withoutOptionalColumns.columnIds, [
    "select",
    "date",
    "payee",
    "category",
    "memo",
    "checkNumber",
    "amount",
    "status",
  ]);
  assert.equal(withoutOptionalColumns.actionColumnId, "status");

  const withoutStatus = buildScheduledPreviewColumnPlan([
    "select",
    "date",
    "payee",
    "category",
    "amount",
  ]);
  assert.deepEqual(withoutStatus.columnIds, [
    "select",
    "date",
    "payee",
    "category",
    "amount",
  ]);
  assert.equal(withoutStatus.actionColumnId, "payee");
});

test("schedules outside the horizon retain the compact control and empty state", () => {
  const result = buildScheduledPreview(
    [schedule("future", "2026-09-20")],
    "2026-09-05",
    7,
  );
  assert.equal(result.scheduledTotal, 1);
  assert.equal(result.total, 0);
  assert.deepEqual(result.items, []);

  const component = readFileSync(
    new URL(
      "../../../apps/web/src/components/accounts/ScheduledTransactionsPreview.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(component, /if \(!preview\.scheduledTotal\) return null/);
  assert.match(component, /No scheduled transactions in the next \{days\} days/);
  assert.match(component, /Upcoming scheduled transaction horizon/);
  assert.match(component, /formatDateForDisplay\(item\.nextDueDate, dateFormat\)/);
  assert.match(component, /<time dateTime=\{item\.nextDueDate\}>/);
});

test("ghost rows remain presentation-only and expose scheduled actions", () => {
  const component = readFileSync(
    new URL(
      "../../../apps/web/src/components/accounts/ScheduledTransactionsPreview.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const page = readFileSync(
    new URL("../../../apps/web/src/pages/AccountRegisterPage.tsx", import.meta.url),
    "utf8",
  );
  const panel = readFileSync(
    new URL(
      "../../../apps/web/src/components/accounts/ScheduledTransactionsPanel.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const css = readFileSync(
    new URL("../../../apps/web/src/styles/register.css", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(component, /<TransactionRow|type="checkbox"|register-status-cleared/);
  assert.ok(
    page.indexOf("<ScheduledTransactionsPreview") <
      page.indexOf("<TransactionRow"),
  );
  assert.match(component, /register-scheduled-ghost-row/);
  assert.match(component, /register-scheduled-ghost-select-placeholder/);
  assert.match(component, /register-scheduled-ghost-content/);
  assert.match(component, /columnPlan\.columnIds\.map/);
  assert.match(component, /style=\{rowStyle\}/);
  assert.match(component, /columnPlan\.actionColumnId === "payee"/);
  assert.match(component, /getScheduledPreviewRelativeLabel/);
  assert.match(component, /ariaLabel=\{`Scheduled transaction actions for/);
  assert.match(component, />\s*Enter now\s*</);
  assert.match(component, />\s*Skip this occurrence\s*</);
  assert.match(component, />\s*Edit schedule\s*</);
  assert.doesNotMatch(component, />\s*Delay/);
  assert.match(component, /confirmDialog\(\{/);
  assert.match(component, /useScheduledTransactionHistory\(/);
  assert.match(page, /onEditSchedule=\{\(scheduleId\)/);
  assert.match(panel, /setDraft\(draftFromScheduled\(schedule\)\)/);

  assert.doesNotMatch(css, /\.register-scheduled-preview/);
  assert.match(css, /\.register-scheduled-ghosts\s*\{[\s\S]*border-bottom: 2px/);
  assert.match(css, /\.register-scheduled-ghost-row-compact\s*\{[\s\S]*grid-template-columns/);
  assert.match(css, /\.register-scheduled-ghost-action:focus-visible/);
  assert.match(css, /\.register-scheduled-ghost-row-mobile/);
});

test("budget-scoped preset preference defaults safely and round-trips", () => {
  const values = new Map<string, string>();
  const raw = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const storage = createFixedBudgetScopedStorage(raw, "budget-a");
  assert.equal(isBudgetScopedStorageKey(SCHEDULED_PREVIEW_DAYS_KEY), true);
  assert.equal(readScheduledPreviewDays(storage), 7);
  for (const value of [3, 7, 14, 30] as const) {
    writeScheduledPreviewDays(storage, value);
    assert.equal(readScheduledPreviewDays(storage), value);
  }
  values.set(
    getBudgetScopedStorageKey("budget-a", SCHEDULED_PREVIEW_DAYS_KEY),
    "12",
  );
  assert.equal(readScheduledPreviewDays(storage), 7);
  assert.equal(values.has(SCHEDULED_PREVIEW_DAYS_KEY), false);
});
