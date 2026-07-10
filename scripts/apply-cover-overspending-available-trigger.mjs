import { readFileSync, writeFileSync } from "node:fs";

const filePath = "apps/web/src/features/budget/BudgetWorkspaceGroup.tsx";
let source = readFileSync(filePath, "utf8");

function replaceOnce(search, replacement, description) {
  if (!source.includes(search)) {
    throw new Error(`Unable to apply cover overspending trigger update: missing ${description}`);
  }

  source = source.replace(search, replacement);
}

replaceOnce(
  'import { ArrowRightLeft } from "lucide-react";\n',
  "",
  "obsolete ArrowRightLeft import",
);

replaceOnce(
  `      {isBudgetColumnVisible("available") ? (\n        <span className="budget-available-action-cell">\n          <strong\n            className={getAvailableClass(category.available, isOverassignedSource)}\n          >\n            {formatMoney(category.available, currencyCode)}\n          </strong>\n          {canCoverOverspending ? (\n            <button\n              className="budget-cover-overspending-trigger"\n              type="button"\n              onClick={(event) => {\n                event.stopPropagation();\n                onSelect();\n                onOpenCoverOverspending?.(event);\n              }}\n              title={\`Cover overspending for \${category.name}\`}\n              aria-label={\`Cover overspending for \${category.name}\`}\n            >\n              <ArrowRightLeft size={14} aria-hidden="true" />\n              <span className="visually-hidden">Cover overspending</span>\n            </button>\n          ) : null}\n        </span>\n      ) : null}`,
  `      {isBudgetColumnVisible("available") ? (\n        <span className="budget-available-action-cell">\n          {canCoverOverspending ? (\n            <button\n              className={\`\${getAvailableClass(\n                category.available,\n                isOverassignedSource,\n              )} budget-available-cover-button\`}\n              type="button"\n              onClick={(event) => {\n                event.stopPropagation();\n                onSelect();\n                onOpenCoverOverspending?.(event);\n              }}\n              title={\`Cover overspending for \${category.name}\`}\n              aria-label={\`Cover overspending for \${category.name}\`}\n            >\n              {formatMoney(category.available, currencyCode)}\n            </button>\n          ) : (\n            <strong\n              className={getAvailableClass(\n                category.available,\n                isOverassignedSource,\n              )}\n            >\n              {formatMoney(category.available, currencyCode)}\n            </strong>\n          )}\n        </span>\n      ) : null}`,
  "Available amount and separate icon trigger block",
);

writeFileSync(filePath, source);
console.log("Cover overspending now opens from the negative Available amount");
