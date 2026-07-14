import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const categoryInput = readFileSync(
  "apps/web/src/features/accounts/components/RegisterCategoryInput.tsx",
  "utf8",
);
const editor = readFileSync(
  "apps/web/src/features/accounts/components/RegisterTransactionEditor.tsx",
  "utf8",
);
const registerPage = readFileSync(
  "apps/web/src/pages/AccountRegisterPage.tsx",
  "utf8",
);
const service = readFileSync(
  "apps/web/src/features/budget/budgetViewService.ts",
  "utf8",
);
const serviceTypes = readFileSync(
  "apps/web/src/features/budget/budgetViewTypes.ts",
  "utf8",
);
const port = readFileSync(
  "apps/web/src/features/budget/categoryPersistencePort.ts",
  "utf8",
);
const styles = readFileSync("apps/web/src/styles/register.css", "utf8");

assert(
  categoryInput.includes("Create “{trimmedValue}”") &&
    categoryInput.includes("Create new group…"),
  "Category autocomplete must offer inline category and group creation",
);
assert(
  categoryInput.includes("ArrowDown") &&
    categoryInput.includes('event.key === "Enter"') &&
    categoryInput.includes('event.key === "Escape"'),
  "Inline category creation must preserve keyboard autocomplete behavior",
);
assert(
  categoryInput.includes("submitCreateCategory") &&
    categoryInput.includes("isSavingCategory"),
  "Inline category creation must handle asynchronous save state",
);
assert(
  editor.includes("onCreateCategory={onCreateCategory}"),
  "New transaction category fields must receive the inline creation callback",
);
assert(
  registerPage.includes("createInlineCategory") &&
    registerPage.includes("categoriesPersistence.createCategory") &&
    registerPage.includes("setCategoryOptions(nextOptions)"),
  "Register must persist a new category and refresh category options",
);
assert(
  serviceTypes.includes("createCategory(input: CreateBudgetCategoryInput)") &&
    port.includes('"createCategory"'),
  "Category persistence contracts must expose category creation",
);
assert(
  service.includes("async createCategory") &&
    service.includes("A category with that name already exists.") &&
    service.includes("createUniqueCategoryIdentifier"),
  "Budget category service must validate and persist generic category creation",
);
assert(
  styles.includes(".register-category-create-panel") &&
    styles.includes(".register-category-create-option"),
  "Register stylesheet must include inline category creation presentation",
);

console.log("v3.10 inline category creation checks passed.");
