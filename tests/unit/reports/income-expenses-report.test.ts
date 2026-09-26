import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const reportsPageSource = readFileSync(
  new URL("../../../apps/web/src/pages/reports/ReportsPage.tsx", import.meta.url),
  "utf8",
);
const reportCatalogueSource = readFileSync(
  new URL("../../../apps/web/src/pages/reports/reportCatalogue.ts", import.meta.url),
  "utf8",
);
const incomeExpensesReportSource = readFileSync(
  new URL(
    "../../../apps/web/src/pages/reports/reports/IncomeExpensesReport.tsx",
    import.meta.url,
  ),
  "utf8",
);
const reportsViewModelSource = readFileSync(
  new URL(
    "../../../apps/web/src/pages/reports/hooks/useReportsViewModel.ts",
    import.meta.url,
  ),
  "utf8",
);

test("Reports workspace exposes the canonical income and expenses report", () => {
  assert.match(reportsPageSource, /<IncomeExpensesReport viewModel=\{reportsViewModel\} \/>/);
  assert.match(
    reportCatalogueSource,
    /title: "Income & Expenses"[\s\S]*status: "available"/,
  );
});

test("Income & Expenses report uses the canonical financial overview query", () => {
  assert.match(reportsViewModelSource, /useFinancialOverviewQuery/);
  assert.match(
    reportsViewModelSource,
    /financialOverview: financialOverviewQuery\.data \?\? null/,
  );
});

test("Income & Expenses report keeps ordinary category inflows outside headline income", () => {
  assert.match(
    incomeExpensesReportSource,
    /monthlySnapshot\.income/,
  );
  assert.match(
    incomeExpensesReportSource,
    /monthlySnapshot\.generalIncome/,
  );
  assert.match(
    incomeExpensesReportSource,
    /monthlySnapshot\.countedCategoryIncome/,
  );
  assert.match(
    incomeExpensesReportSource,
    /monthlySnapshot\.categoryInflows/,
  );
  assert.match(
    incomeExpensesReportSource,
    /These are not included in headline income or savings\./,
  );
});
