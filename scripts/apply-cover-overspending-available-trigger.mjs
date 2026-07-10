import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(source, search, replacement, description) {
  if (!source.includes(search)) {
    throw new Error(`Unable to apply cover overspending trigger update: missing ${description}`);
  }

  return source.replace(search, replacement);
}

const componentPath = "apps/web/src/features/budget/BudgetWorkspaceGroup.tsx";
let componentSource = readFileSync(componentPath, "utf8");

componentSource = replaceOnce(
  componentSource,
  'import { ArrowRightLeft } from "lucide-react";\n',
  "",
  "obsolete ArrowRightLeft import",
);

componentSource = replaceOnce(
  componentSource,
  `      {isBudgetColumnVisible("available") ? (\n        <span className="budget-available-action-cell">\n          <strong\n            className={getAvailableClass(category.available, isOverassignedSource)}\n          >\n            {formatMoney(category.available, currencyCode)}\n          </strong>\n          {canCoverOverspending ? (\n            <button\n              className="budget-cover-overspending-trigger"\n              type="button"\n              onClick={(event) => {\n                event.stopPropagation();\n                onSelect();\n                onOpenCoverOverspending?.(event);\n              }}\n              title={\`Cover overspending for \${category.name}\`}\n              aria-label={\`Cover overspending for \${category.name}\`}\n            >\n              <ArrowRightLeft size={14} aria-hidden="true" />\n              <span className="visually-hidden">Cover overspending</span>\n            </button>\n          ) : null}\n        </span>\n      ) : null}`,
  `      {isBudgetColumnVisible("available") ? (\n        <span className="budget-available-action-cell">\n          {canCoverOverspending ? (\n            <button\n              className={\`\${getAvailableClass(\n                category.available,\n                isOverassignedSource,\n              )} budget-available-cover-button\`}\n              type="button"\n              onClick={(event) => {\n                event.stopPropagation();\n                onSelect();\n                onOpenCoverOverspending?.(event);\n              }}\n              title={\`Cover overspending for \${category.name}\`}\n              aria-label={\`Cover overspending for \${category.name}\`}\n            >\n              {formatMoney(category.available, currencyCode)}\n            </button>\n          ) : (\n            <strong\n              className={getAvailableClass(\n                category.available,\n                isOverassignedSource,\n              )}\n            >\n              {formatMoney(category.available, currencyCode)}\n            </strong>\n          )}\n        </span>\n      ) : null}`,
  "Available amount and separate icon trigger block",
);

writeFileSync(componentPath, componentSource);

const stylesPath = "apps/web/src/styles/globals.css";
let stylesSource = readFileSync(stylesPath, "utf8");

stylesSource = replaceOnce(
  stylesSource,
  `.budget-available-action-cell {\n  justify-self: start;\n  min-width: 0;\n  display: inline-flex;\n  align-items: center;\n  gap: 0.3rem;\n}\n\n.budget-available-action-cell .available-pill {\n  min-width: 0;\n}\n\n.budget-cover-overspending-trigger {\n  width: 1.85rem;\n  height: 1.85rem;\n  border: 1px solid color-mix(in srgb, var(--negative) 32%, var(--border));\n  border-radius: 999px;\n  background: var(--negative-bg);\n  color: var(--negative);\n  cursor: pointer;\n  display: inline-grid;\n  place-items: center;\n  flex: 0 0 auto;\n  padding: 0;\n}\n\n.budget-cover-overspending-trigger:hover,\n.budget-cover-overspending-trigger:focus-visible {\n  background: color-mix(in srgb, var(--negative-bg) 72%, var(--surface));\n  border-color: var(--negative);\n  outline: none;\n}\n\n.budget-cover-overspending-trigger:focus-visible {\n  box-shadow: 0 0 0 2px color-mix(in srgb, var(--negative) 22%, transparent);\n}\n\n`,
  "",
  "obsolete cover overspending icon-button styles",
);

writeFileSync(stylesPath, stylesSource);
console.log("Cover overspending now opens from the negative Available amount");
