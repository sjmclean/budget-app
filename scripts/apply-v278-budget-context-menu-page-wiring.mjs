import { readFileSync, writeFileSync } from "node:fs";

const filePath = "apps/web/src/pages/BudgetPage.tsx";
let source = readFileSync(filePath, "utf8");

function replaceOnce(search, replacement, description) {
  if (!source.includes(search)) {
    throw new Error(`Unable to apply v278 page wiring: missing ${description}`);
  }

  source = source.replace(search, replacement);
}

replaceOnce(
  'import { useEffect, useMemo, useState } from "react";',
  'import { useEffect, useMemo, useState, type MouseEvent } from "react";',
  "React MouseEvent import",
);

replaceOnce(
  'import { useBudgetDragDrop } from "../features/budget/useBudgetDragDrop";\n',
  'import { useBudgetDragDrop } from "../features/budget/useBudgetDragDrop";\nimport { BudgetCategoryContextMenu } from "../features/budget/BudgetCategoryContextMenu";\nimport { resolveFloatingPositionFromMouseEvent, type FloatingPosition } from "../features/floatingUi";\n',
  "budget context menu imports",
);

replaceOnce(
  '  const [hideArchivedCategories, setHideArchivedCategories] = useState(false);\n  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);',
  '  const [hideArchivedCategories, setHideArchivedCategories] = useState(false);\n  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);\n  const [budgetContextMenu, setBudgetContextMenu] = useState<{\n    category: BudgetCategoryView;\n    group: BudgetCategoryGroupView;\n    position: Pick<FloatingPosition, "top" | "left">;\n  } | null>(null);',
  "budget context menu state",
);

replaceOnce(
  '  function openCategoryEditor(categoryId: string) {\n    if (isCreditCardPaymentCategory(categoryId)) {\n      selectCategory(categoryId);\n      return;\n    }\n\n    selectCategory(categoryId);\n    setIsCategoryManagerOpen(true);\n  }',
  '  function openCategoryEditor(categoryId: string) {\n    if (isCreditCardPaymentCategory(categoryId)) {\n      selectCategory(categoryId);\n      return;\n    }\n\n    selectCategory(categoryId);\n    setIsCategoryManagerOpen(true);\n  }\n\n  function closeBudgetContextMenu() {\n    setBudgetContextMenu(null);\n  }\n\n  function openBudgetContextMenu({\n    event,\n    category,\n    group,\n  }: {\n    event: MouseEvent<HTMLElement>;\n    category: BudgetCategoryView;\n    group: BudgetCategoryGroupView;\n  }) {\n    setBudgetContextMenu({\n      category,\n      group,\n      position: resolveFloatingPositionFromMouseEvent(event.nativeEvent, {\n        floatingSize: { width: 260, height: 260 },\n        viewport: { width: window.innerWidth, height: window.innerHeight },\n      }),\n    });\n  }',
  "budget context menu handlers",
);

replaceOnce(
  '                    onSelectCategory={selectCategory}\n                    onOpenCategoryEditor={openCategoryEditor}\n                    onAssignedChange={updateAssigned}',
  '                    onSelectCategory={selectCategory}\n                    onOpenCategoryEditor={openCategoryEditor}\n                    onOpenCategoryContextMenu={openBudgetContextMenu}\n                    onAssignedChange={updateAssigned}',
  "BudgetGroup context menu prop",
);

replaceOnce(
  '      <BudgetActivityDrilldownModal\n        drilldown={activityDrilldown}',
  '      <BudgetCategoryContextMenu\n        isOpen={Boolean(budgetContextMenu)}\n        position={budgetContextMenu?.position ?? null}\n        category={budgetContextMenu?.category ?? null}\n        group={budgetContextMenu?.group ?? null}\n        hasActivity={(budgetContextMenu?.category.activity ?? 0) !== 0}\n        onClose={closeBudgetContextMenu}\n        onOpenActivity={openActivityDrilldown}\n        onOpenManageCategory={openCategoryEditor}\n        onRenameCategory={openCategoryEditor}\n        onSetCategoryArchived={setCategoryArchived}\n      />\n      <BudgetActivityDrilldownModal\n        drilldown={activityDrilldown}',
  "BudgetCategoryContextMenu render",
);

writeFileSync(filePath, source);
console.log("v278 budget context menu page wiring applied");
