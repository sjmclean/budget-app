import { useState } from "react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import {
  cloneNewBudgetCategoryGroups,
  countSelectedCategories,
  defaultNewBudgetSetup,
  type NewBudgetCategoryGroupSetup,
  type NewBudgetSetup,
} from "./budgetTemplates";
import { currencyOptions } from "../../settings/settingsPreferences";

export interface NewBudgetWizardProps {
  onBack: () => void;
  onCreateBudget: (setup: NewBudgetSetup) => void;
}

type WizardStep = "details" | "regional" | "categories" | "review";

const dateFormatOptions = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const;
const numberFormatOptions = ["1,234.56", "1.234,56", "1 234,56"] as const;
const firstDayOptions = [
  { value: "monday", label: "Monday" },
  { value: "sunday", label: "Sunday" },
  { value: "saturday", label: "Saturday" },
] as const;

function getStepTitle(step: WizardStep): string {
  switch (step) {
    case "regional":
      return "Regional settings";
    case "categories":
      return "Choose categories";
    case "review":
      return "Review setup";
    case "details":
    default:
      return "Create new budget";
  }
}

function makeSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "category";
}

function makeUniqueCategoryId(group: NewBudgetCategoryGroupSetup, name: string): string {
  const base = makeSlug(name);
  const existing = new Set(group.categories.map((category) => category.id));

  if (!existing.has(base)) {
    return base;
  }

  let index = 2;
  while (existing.has(`${base}-${index}`)) {
    index += 1;
  }

  return `${base}-${index}`;
}

export function NewBudgetWizard({ onBack, onCreateBudget }: NewBudgetWizardProps) {
  const [step, setStep] = useState<WizardStep>("details");
  const [setup, setSetup] = useState<NewBudgetSetup>(() => ({
    ...defaultNewBudgetSetup,
    categoryGroups: cloneNewBudgetCategoryGroups(defaultNewBudgetSetup.categoryGroups),
  }));
  const [formError, setFormError] = useState<string | null>(null);
  const [newCategoryNames, setNewCategoryNames] = useState<Record<string, string>>({});

  const selectedCategoryCount = countSelectedCategories(setup.categoryGroups);

  function updateSetup(next: Partial<NewBudgetSetup>) {
    setSetup((current) => ({ ...current, ...next }));
    setFormError(null);
  }

  function updateCategoryGroups(
    updater: (groups: NewBudgetCategoryGroupSetup[]) => NewBudgetCategoryGroupSetup[],
  ) {
    setSetup((current) => ({
      ...current,
      categoryGroups: updater(current.categoryGroups),
    }));
    setFormError(null);
  }

  function toggleGroup(groupId: string) {
    updateCategoryGroups((groups) =>
      groups.map((group) => {
        if (group.id !== groupId) {
          return group;
        }

        const nextSelected = !group.selected;
        return {
          ...group,
          selected: nextSelected,
          categories: group.categories.map((category) => ({
            ...category,
            selected: nextSelected,
          })),
        };
      }),
    );
  }

  function toggleCategory(groupId: string, categoryId: string) {
    updateCategoryGroups((groups) =>
      groups.map((group) => {
        if (group.id !== groupId) {
          return group;
        }

        const categories = group.categories.map((category) =>
          category.id === categoryId
            ? { ...category, selected: !category.selected }
            : category,
        );
        const selectedCount = categories.filter((category) => category.selected).length;

        return {
          ...group,
          selected: selectedCount > 0,
          categories,
        };
      }),
    );
  }

  function addCategory(groupId: string) {
    const name = (newCategoryNames[groupId] ?? "").trim();

    if (!name) {
      setFormError("Enter a category name before adding it.");
      return;
    }

    updateCategoryGroups((groups) =>
      groups.map((group) => {
        if (group.id !== groupId) {
          return group;
        }

        return {
          ...group,
          selected: true,
          categories: [
            ...group.categories,
            {
              id: makeUniqueCategoryId(group, name),
              name,
              selected: true,
              custom: true,
            },
          ],
        };
      }),
    );
    setNewCategoryNames((current) => ({ ...current, [groupId]: "" }));
  }

  function createBudget() {
    const name = setup.name.trim();

    if (!name) {
      setFormError("Enter a budget name before creating a budget.");
      setStep("details");
      return;
    }

    onCreateBudget({
      ...setup,
      name,
      categoryGroups: cloneNewBudgetCategoryGroups(setup.categoryGroups),
    });
  }

  return (
    <Card className="budget-create-card budget-create-card-glass new-budget-wizard-card">
      <div className="budget-launch-nav">
        <button type="button" onClick={step === "details" ? onBack : () => setStep("details")}>
          ← {step === "details" ? "Back" : "Budget details"}
        </button>
      </div>

      <div className="new-budget-wizard-header">
        <p className="eyebrow">New budget setup</p>
        <h2>{getStepTitle(step)}</h2>
        <p>
          Start with just a name, or customise regional settings and choose the categories you want before creating the budget.
        </p>
      </div>

      <div className="new-budget-stepper" aria-label="Budget setup steps">
        {(["details", "regional", "categories", "review"] as WizardStep[]).map((item, index) => (
          <button
            key={item}
            type="button"
            className={item === step ? "is-active" : ""}
            onClick={() => setStep(item)}
          >
            <span>{index + 1}</span>
            {getStepTitle(item)}
          </button>
        ))}
      </div>

      {step === "details" ? (
        <div className="new-budget-step-panel">
          <label className="form-field budget-name-field">
            <span className="field-label">Budget name</span>
            <input
              className="text-input budget-selector-input"
              value={setup.name}
              onChange={(event) => updateSetup({ name: event.target.value })}
              placeholder="Personal Budget"
              autoFocus
            />
          </label>

          {formError ? <p className="form-error">{formError}</p> : null}

          <div className="new-budget-fast-path">
            <Button type="button" onClick={createBudget}>
              Create budget
            </Button>
            <Button type="button" variant="secondary" onClick={() => setStep("regional")}>
              Customise setup
            </Button>
          </div>

          <p className="new-budget-default-summary">
            Uses AUD, DD/MM/YYYY, Monday week start, and {selectedCategoryCount} starter categories unless customised.
          </p>
        </div>
      ) : null}

      {step === "regional" ? (
        <div className="new-budget-step-panel new-budget-grid">
          <label className="form-field">
            <span className="field-label">Currency</span>
            <select
              className="text-input"
              value={setup.currency}
              onChange={(event) => updateSetup({ currency: event.target.value })}
            >
              {currencyOptions.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.label}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span className="field-label">Date format</span>
            <select
              className="text-input"
              value={setup.dateFormat}
              onChange={(event) => updateSetup({ dateFormat: event.target.value as NewBudgetSetup["dateFormat"] })}
            >
              {dateFormatOptions.map((format) => (
                <option key={format} value={format}>{format}</option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span className="field-label">Number format</span>
            <select
              className="text-input"
              value={setup.numberFormat}
              onChange={(event) => updateSetup({ numberFormat: event.target.value as NewBudgetSetup["numberFormat"] })}
            >
              {numberFormatOptions.map((format) => (
                <option key={format} value={format}>{format}</option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span className="field-label">Week starts on</span>
            <select
              className="text-input"
              value={setup.firstDayOfWeek}
              onChange={(event) => updateSetup({ firstDayOfWeek: event.target.value as NewBudgetSetup["firstDayOfWeek"] })}
            >
              {firstDayOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <div className="new-budget-actions-wide">
            <Button type="button" variant="secondary" onClick={() => setStep("details")}>Back</Button>
            <Button type="button" onClick={() => setStep("categories")}>Next: categories</Button>
          </div>
        </div>
      ) : null}

      {step === "categories" ? (
        <div className="new-budget-step-panel">
          <div className="new-budget-category-intro">
            <div>
              <h3>Choose starter categories</h3>
              <p>Untick anything you do not need. Add extra categories now, or create more later from the Budget screen.</p>
            </div>
            <strong>{selectedCategoryCount} selected</strong>
          </div>

          <div className="new-budget-category-list">
            {setup.categoryGroups.map((group) => {
              const groupSelectedCount = group.categories.filter((category) => category.selected).length;

              return (
                <section key={group.id} className="new-budget-category-group">
                  <label className="new-budget-category-group-header">
                    <input
                      type="checkbox"
                      checked={group.selected}
                      onChange={() => toggleGroup(group.id)}
                    />
                    <span>
                      <strong>{group.name}</strong>
                      <small>{groupSelectedCount} of {group.categories.length} selected</small>
                    </span>
                  </label>

                  <div className="new-budget-category-items">
                    {group.categories.map((category) => (
                      <label key={category.id} className="new-budget-category-item">
                        <input
                          type="checkbox"
                          checked={group.selected && category.selected}
                          onChange={() => toggleCategory(group.id, category.id)}
                        />
                        <span>{category.name}</span>
                        {category.custom ? <em>Added</em> : null}
                      </label>
                    ))}
                  </div>

                  <div className="new-budget-add-category-row">
                    <input
                      className="text-input"
                      value={newCategoryNames[group.id] ?? ""}
                      onChange={(event) => setNewCategoryNames((current) => ({ ...current, [group.id]: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addCategory(group.id);
                        }
                      }}
                      placeholder={`Add category to ${group.name}`}
                    />
                    <Button type="button" variant="secondary" onClick={() => addCategory(group.id)}>
                      Add
                    </Button>
                  </div>
                </section>
              );
            })}
          </div>

          {formError ? <p className="form-error">{formError}</p> : null}

          <div className="new-budget-actions-wide">
            <Button type="button" variant="secondary" onClick={() => setStep("regional")}>Back</Button>
            <Button type="button" onClick={() => setStep("review")}>Review</Button>
          </div>
        </div>
      ) : null}

      {step === "review" ? (
        <div className="new-budget-step-panel">
          <dl className="new-budget-review-list">
            <div><dt>Name</dt><dd>{setup.name.trim() || "Not set"}</dd></div>
            <div><dt>Currency</dt><dd>{setup.currency}</dd></div>
            <div><dt>Date format</dt><dd>{setup.dateFormat}</dd></div>
            <div><dt>Number format</dt><dd>{setup.numberFormat}</dd></div>
            <div><dt>Week starts</dt><dd>{firstDayOptions.find((option) => option.value === setup.firstDayOfWeek)?.label}</dd></div>
            <div><dt>Categories</dt><dd>{selectedCategoryCount} selected</dd></div>
          </dl>

          {formError ? <p className="form-error">{formError}</p> : null}

          <div className="new-budget-actions-wide">
            <Button type="button" variant="secondary" onClick={() => setStep("categories")}>Back</Button>
            <Button type="button" onClick={createBudget}>Create budget</Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
