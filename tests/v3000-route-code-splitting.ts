import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const router = read("apps/web/src/app/router.tsx");
const selector = read("apps/web/src/pages/BudgetSelectorPage.tsx");
const app = read("apps/web/src/App.tsx");
const compactRouter = router.replace(/\s+/g, "");

for (const page of [
  "DashboardPage",
  "BudgetPage",
  "AccountsPage",
  "AccountRegisterPage",
  "ReportsPage",
  "SettingsPage",
  "PayeeManagementPage",
]) {
  assert(
    !router.includes(`import { ${page} } from`),
    `${page} must not be eagerly imported by the router`,
  );
}

assert(
  router.includes('lazy: async () =>'),
  "router should use lazy route modules",
);
assert(
  compactRouter.includes('import("../pages/AccountRegisterPage")'),
  "Account Register must be loaded as a separate route chunk",
);
assert(
  compactRouter.includes('import("../pages/SettingsPage")'),
  "Settings must be loaded as a separate route chunk",
);
assert(
  router.includes('errorElement: <RouteErrorScreen />'),
  "route error recovery must remain configured",
);
assert(
  app.includes('import { Suspense } from "react"'),
  "application should use React Suspense for lazy route loading",
);
assert(
  app.includes("<Suspense") && app.includes("<RouterProvider router={router} />"),
  "initial lazy route loading should wrap RouterProvider in Suspense",
);

assert(
  !selector.includes('import { BudgetImportDialog } from'),
  "Budget Import workflow must not be eagerly imported",
);
assert(
  !selector.includes('import { NewBudgetWizard } from'),
  "New Budget workflow must not be eagerly imported",
);
assert(
  selector.includes('const LazyBudgetImportDialog = lazy('),
  "Budget Import workflow should be lazy loaded",
);
assert(
  selector.includes('const LazyNewBudgetWizard = lazy('),
  "New Budget workflow should be lazy loaded",
);
assert(
  selector.includes('<Suspense fallback={<BudgetWorkflowLoading />}>'),
  "lazy workflows should render an accessible loading fallback",
);

console.log("v3.00 route and workflow code-splitting checks passed");
