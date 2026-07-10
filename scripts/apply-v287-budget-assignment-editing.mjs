import { readFileSync, writeFileSync } from "node:fs";

const path = "apps/web/src/features/budget/useBudgetWorkspace.ts";
let source = readFileSync(path, "utf8");

function replaceOnce(search, replacement, description) {
  if (!source.includes(search)) {
    throw new Error(`Unable to apply v287 integration: missing ${description}`);
  }
  source = source.replace(search, replacement);
}

replaceOnce(
  'import { useEffect, useMemo, useState } from "react";',
  'import { useEffect, useMemo, useRef, useState } from "react";',
  "React hooks import",
);

replaceOnce(
  'import { isMoneyNegative } from "./moneyMath";\n',
  'import { isMoneyNegative } from "./moneyMath";\nimport { applyCategoryAssignedValues } from "./budgetMoneyMovement";\nimport { createBudgetAssignmentEditSession } from "./budgetAssignmentEditing";\n',
  "budget assignment imports",
);

replaceOnce(
  '  executeUndoableBudgetMoneyMovement,\n  registerBudgetUndoRedoContext,\n',
  '  executeUndoableBudgetAssignmentChanges,\n  executeUndoableBudgetMoneyMovement,\n  registerBudgetUndoRedoContext,\n',
  "budget undo redo imports",
);

replaceOnce(
  '  const [isActivityDrilldownLoading, setIsActivityDrilldownLoading] =\n    useState(false);\n',
  '  const [isActivityDrilldownLoading, setIsActivityDrilldownLoading] =\n    useState(false);\n  const assignmentEditSessionRef = useRef(createBudgetAssignmentEditSession());\n  const assignmentEditTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);\n  const dataRef = useRef<BudgetMonthView | null>(null);\n',
  "assignment session refs",
);

replaceOnce(
  '    }),\n  [budgetId, budgetViewPersistence, month]);',
  '    }, {\n      flushPending: () => flushPendingAssignmentEdits(),\n    }),\n  [budgetId, budgetViewPersistence, month]);',
  "undo redo context registration",
);

replaceOnce(
  '  const data = editedData ?? budgetView.data;\n',
  '  const data = editedData ?? budgetView.data;\n  dataRef.current = data;\n\n  async function flushPendingAssignmentEdits() {\n    if (assignmentEditTimerRef.current) {\n      clearTimeout(assignmentEditTimerRef.current);\n      assignmentEditTimerRef.current = null;\n    }\n\n    const changes = assignmentEditSessionRef.current.consume();\n    if (changes.length === 0) {\n      return;\n    }\n\n    const result = await executeUndoableBudgetAssignmentChanges({ month, changes });\n    if (!result.performed) {\n      setSaveError(result.error ?? "Failed to save budget assignment changes.");\n    }\n  }\n',
  "data and pending edit flush",
);

replaceOnce(
  `  function updateAssigned(categoryId: string, assigned: number) {\n    setLastEditedCategoryId(categoryId);\n    setSaveError(null);\n\n    void categoriesPersistence\n      .updateAssigned({\n        budgetId,\n        month,\n        categoryId,\n        assigned,\n      })\n      .then((nextData) => {\n        setEditedData(nextData);\n      })\n      .catch((error) => {\n        setSaveError(\n          error instanceof Error\n            ? error.message\n            : "Failed to save category assignment.",\n        );\n      });\n  }`,
  `  function updateAssigned(categoryId: string, assigned: number) {\n    const currentData = dataRef.current;\n    const category = currentData?.categoryGroups\n      .flatMap((group) => group.categories)\n      .find((item) => item.id === categoryId);\n\n    if (!currentData || !category) {\n      setSaveError("Unable to find the category being edited.");\n      return;\n    }\n\n    setLastEditedCategoryId(categoryId);\n    setSaveError(null);\n    assignmentEditSessionRef.current.record({\n      categoryId,\n      categoryName: category.name,\n      originalAssigned: category.assigned,\n      finalAssigned: assigned,\n    });\n\n    setEditedData(\n      applyCategoryAssignedValues(currentData, [{ categoryId, assigned }]),\n    );\n\n    if (assignmentEditTimerRef.current) {\n      clearTimeout(assignmentEditTimerRef.current);\n    }\n\n    assignmentEditTimerRef.current = setTimeout(() => {\n      void flushPendingAssignmentEdits();\n    }, 1800);\n  }`,
  "updateAssigned implementation",
);

writeFileSync(path, source);
console.log("Applied v287 grouped undoable budget assignment editing integration");
