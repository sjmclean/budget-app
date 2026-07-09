import { readFileSync, writeFileSync } from "node:fs";

const filePath = "apps/web/src/pages/BudgetPage.tsx";
let source = readFileSync(filePath, "utf8");

function replaceOnce(search, replacement, description) {
  if (!source.includes(search)) {
    throw new Error(`Unable to apply v280 cover overspending wiring: missing ${description}`);
  }

  source = source.replace(search, replacement);
}

replaceOnce(
  'import { BudgetCategoryContextMenu } from "../features/budget/BudgetCategoryContextMenu";\n',
  'import { BudgetCategoryContextMenu } from "../features/budget/BudgetCategoryContextMenu";\nimport { BudgetCoverOverspendingMenu } from "../features/budget/BudgetCoverOverspendingMenu";\n',
  "BudgetCoverOverspendingMenu import",
);

replaceOnce(
  '  const [budgetContextMenu, setBudgetContextMenu] = useState<{\n    category: BudgetCategoryView;\n    group: BudgetCategoryGroupView;\n    position: Pick<FloatingPosition, "top" | "left">;\n  } | null>(null);',
  '  const [budgetContextMenu, setBudgetContextMenu] = useState<{\n    category: BudgetCategoryView;\n    group: BudgetCategoryGroupView;\n    position: Pick<FloatingPosition, "top" | "left">;\n  } | null>(null);\n  const [coverOverspendingMenu, setCoverOverspendingMenu] = useState<{\n    category: BudgetCategoryView;\n    position: Pick<FloatingPosition, "top" | "left">;\n  } | null>(null);',
  "cover overspending menu state",
);

replaceOnce(
  '  function closeBudgetContextMenu() {\n    setBudgetContextMenu(null);\n  }',
  '  function closeBudgetContextMenu() {\n    setBudgetContextMenu(null);\n  }\n\n  function closeCoverOverspendingMenu() {\n    setCoverOverspendingMenu(null);\n  }',
  "cover overspending close handler",
);

replaceOnce(
  '  function openBudgetContextMenu({\n    event,\n    category,\n    group,\n  }: {\n    event: MouseEvent<HTMLElement>;\n    category: BudgetCategoryView;\n    group: BudgetCategoryGroupView;\n  }) {\n    setBudgetContextMenu({\n      category,\n      group,\n      position: resolveFloatingPositionFromMouseEvent(event.nativeEvent, {\n        floatingSize: { width: 260, height: 260 },\n        viewport: { width: window.innerWidth, height: window.innerHeight },\n      }),\n    });\n  }',
  '  function openBudgetContextMenu({\n    event,\n    category,\n    group,\n  }: {\n    event: MouseEvent<HTMLElement>;\n    category: BudgetCategoryView;\n    group: BudgetCategoryGroupView;\n  }) {\n    setBudgetContextMenu({\n      category,\n      group,\n      position: resolveFloatingPositionFromMouseEvent(event.nativeEvent, {\n        floatingSize: { width: 260, height: 260 },\n        viewport: { width: window.innerWidth, height: window.innerHeight },\n      }),\n    });\n  }\n\n  function openCoverOverspendingMenu(categoryId: string) {\n    const category = budgetContextMenu?.category;\n\n    if (!category || category.id !== categoryId) {\n      return;\n    }\n\n    setCoverOverspendingMenu({\n      category,\n      position: budgetContextMenu.position,\n    });\n  }',
  "cover overspending open handler",
);

replaceOnce(
  '        onOpenActivity={openActivityDrilldown}\n        onOpenManageCategory={openCategoryEditor}',
  '        onOpenActivity={openActivityDrilldown}\n        onOpenCoverOverspending={openCoverOverspendingMenu}\n        onOpenManageCategory={openCategoryEditor}',
  "context menu cover action prop",
);

replaceOnce(
  '      <BudgetActivityDrilldownModal\n        drilldown={activityDrilldown}',
  '      <BudgetCoverOverspendingMenu\n        isOpen={Boolean(coverOverspendingMenu)}\n        position={coverOverspendingMenu?.position ?? null}\n        overspentCategory={coverOverspendingMenu?.category ?? null}\n        coverOptions={coverOptions}\n        currencyCode={data.currencyCode}\n        onClose={closeCoverOverspendingMenu}\n        onCoverOverspending={(input) => {\n          closeCoverOverspendingMenu();\n          coverOverspending(input);\n        }}\n      />\n      <BudgetActivityDrilldownModal\n        drilldown={activityDrilldown}',
  "BudgetCoverOverspendingMenu render",
);

writeFileSync(filePath, source);
console.log("v280 cover overspending menu wiring applied");
