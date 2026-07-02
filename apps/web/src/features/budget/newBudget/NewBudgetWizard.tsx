import { useMemo, useState } from "react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import {
  budgetTemplates,
  defaultNewBudgetSetup,
  getBudgetTemplate,
  type BudgetTemplateId,
  type NewBudgetSetup,
} from "./budgetTemplates";
import { currencyOptions } from "../../settings/settingsPreferences";

export interface NewBudgetWizardProps {
  onBack: () => void;
  onCreateBudget: (setup: NewBudgetSetup) => void;
}

type WizardStep = "details" | "regional" | "template" | "review";

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
    case "template":
      return "Choose categories";
    case "review":
      return "Review setup";
    case "details":
    default:
      return "Create new budget";
  }
}

export function NewBudgetWizard({ onBack, onCreateBudget }: NewBudgetWizardProps) {
  const [step, setStep] = useState<WizardStep>("details");
  const [setup, setSetup] = useState<NewBudgetSetup>(defaultNewBudgetSetup);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => getBudgetTemplate(setup.templateId),
    [setup.templateId],
  );

  function updateSetup(next: Partial<NewBudgetSetup>) {
    setSetup((current) => ({ ...current, ...next }));
    setFormError(null);
  }

  function createBudget() {
    const name = setup.name.trim();

    if (!name) {
      setFormError("Enter a budget name before creating a budget.");
      setStep("details");
      return;
    }

    onCreateBudget({ ...setup, name });
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
          Start with just a name, or customise regional settings and starter categories before creating the budget.
        </p>
      </div>

      <div className="new-budget-stepper" aria-label="Budget setup steps">
        {(["details", "regional", "template", "review"] as WizardStep[]).map((item, index) => (
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
            Uses AUD, DD/MM/YYYY, Monday week start, and Starter Budget categories unless customised.
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
            <Button type="button" onClick={() => setStep("template")}>Next: categories</Button>
          </div>
        </div>
      ) : null}

      {step === "template" ? (
        <div className="new-budget-step-panel">
          <div className="new-budget-template-grid">
            {budgetTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                className={template.id === setup.templateId ? "new-budget-template-card is-selected" : "new-budget-template-card"}
                onClick={() => updateSetup({ templateId: template.id as BudgetTemplateId })}
              >
                <span className="new-budget-template-radio" aria-hidden="true">
                  {template.id === setup.templateId ? "●" : "○"}
                </span>
                <span>
                  <strong>{template.name}</strong>
                  <small>{template.description}</small>
                  <em>{template.summary}</em>
                </span>
              </button>
            ))}
          </div>

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
            <div><dt>Categories</dt><dd>{selectedTemplate.name}</dd></div>
          </dl>

          {formError ? <p className="form-error">{formError}</p> : null}

          <div className="new-budget-actions-wide">
            <Button type="button" variant="secondary" onClick={() => setStep("template")}>Back</Button>
            <Button type="button" onClick={createBudget}>Create budget</Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
