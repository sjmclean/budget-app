import { readFileSync, writeFileSync } from "node:fs";

const filePath = "apps/web/src/features/budget/useBudgetWorkspace.ts";
let source = readFileSync(filePath, "utf8");

function replaceOnce(search, replacement, description) {
  if (!source.includes(search)) {
    throw new Error(`Unable to apply v286 integration: missing ${description}`);
  }

  source = source.replace(search, replacement);
}

replaceOnce(
  'import { isMoneyNegative } from "./moneyMath";\n',
  'import { isMoneyNegative } from "./moneyMath";\nimport {\n  executeUndoableBudgetMoneyMovement,\n  registerBudgetUndoRedoContext,\n} from "./budgetUndoRedo";\n',
  "budget undo redo imports",
);

replaceOnce(
  '  const categoriesPersistence = getAppPersistenceGateway().categories;\n  const budgetView = useBudgetView(budgetId, month);',
  '  const persistenceGateway = getAppPersistenceGateway();\n  const categoriesPersistence = persistenceGateway.categories;\n  const budgetViewPersistence = persistenceGateway.budgetView;\n  const budgetView = useBudgetView(budgetId, month);',
  "persistence gateway setup",
);

replaceOnce(
  '  const [isActivityDrilldownLoading, setIsActivityDrilldownLoading] =\n    useState(false);\n\n  useEffect(() => {',
  '  const [isActivityDrilldownLoading, setIsActivityDrilldownLoading] =\n    useState(false);\n\n  useEffect(() =>\n    registerBudgetUndoRedoContext(`${budgetId}:${month}`, {\n      getBudgetMonthView(requestedMonth) {\n        return budgetViewPersistence.getBudgetMonthView({\n          budgetId,\n          month: requestedMonth,\n        });\n      },\n      async setCategoryAssignedValues({ month: requestedMonth, assignments }) {\n        const nextData = await budgetViewPersistence.setCategoryAssignedValues({\n          budgetId,\n          month: requestedMonth,\n          assignments,\n        });\n        setEditedData(nextData);\n        return nextData;\n      },\n    }),\n  [budgetId, budgetViewPersistence, month]);\n\n  useEffect(() => {',
  "Budget workspace history context registration",
);

replaceOnce(
  `  function coverOverspending(input: {\n    overspentCategoryId: string;\n    coveringCategoryId: string;\n    amount: number;\n  }) {\n    setLastEditedCategoryId(input.overspentCategoryId);\n    setSaveError(null);\n\n    void categoriesPersistence\n      .coverOverspending({\n        budgetId,\n        month,\n        overspentCategoryId: input.overspentCategoryId,\n        coveringCategoryId: input.coveringCategoryId,\n        amount: input.amount,\n      })\n      .then((nextData) => {\n        setEditedData(nextData);\n        setSelectedCategoryId(input.overspentCategoryId);\n      })\n      .catch((error) => {\n        setSaveError(\n          error instanceof Error\n            ? error.message\n            : "Failed to cover overspending.",\n        );\n      });\n  }`,
  `  function coverOverspending(input: {\n    overspentCategoryId: string;\n    coveringCategoryId: string;\n    amount: number;\n  }) {\n    setLastEditedCategoryId(input.overspentCategoryId);\n    setSaveError(null);\n\n    const coveringCategory = data?.categoryGroups\n      .flatMap((group) => group.categories)\n      .find((category) => category.id === input.coveringCategoryId);\n    const overspentCategory = data?.categoryGroups\n      .flatMap((group) => group.categories)\n      .find((category) => category.id === input.overspentCategoryId);\n\n    if (!coveringCategory || !overspentCategory) {\n      setSaveError("Unable to find the categories required to cover overspending.");\n      return;\n    }\n\n    if (!Number.isFinite(input.amount) || input.amount <= 0) {\n      setSaveError("Cover amount must be positive.");\n      return;\n    }\n\n    if (coveringCategory.available < input.amount) {\n      setSaveError("Covering category has insufficient available funds.");\n      return;\n    }\n\n    void executeUndoableBudgetMoneyMovement({\n      month,\n      sourceCategoryId: input.coveringCategoryId,\n      destinationCategoryId: input.overspentCategoryId,\n      amount: input.amount,\n    }).then((result) => {\n      if (result.performed) {\n        setSelectedCategoryId(input.overspentCategoryId);\n        return;\n      }\n\n      setSaveError(result.error ?? "Failed to cover overspending.");\n    });\n  }`,
  "cover overspending persistence call",
);

writeFileSync(filePath, source);
console.log("v286 Budget Undo/Redo integration applied");
