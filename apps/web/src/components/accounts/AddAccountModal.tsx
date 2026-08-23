import { useEffect, useState } from "react";
import type { CreditCardBehaviour } from "../../features/budget/budgetPreferences";
import { MoneyInput } from "../../features/money/MoneyInput";

type AccountType = "on-budget" | "credit-card" | "tracking";

interface EditableAccount {
  id: string;
  name: string;
  type: AccountType;
  startingBalance: number;
}

interface AddAccountModalProps {
  isOpen: boolean;
  account?: EditableAccount | null;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    type: AccountType;
    startingBalance: number;
  }) => void;
  shouldAskCreditCardBehaviour?: boolean;
  onCreditCardBehaviourSelected?: (behaviour: CreditCardBehaviour) => void;
  onUpdate?: (input: {
    id: string;
    name: string;
    type: AccountType;
  }) => void;
}

function formatStartingBalance(value: number): string {
  return value === 0 ? "" : String(value);
}

export function AddAccountModal({
  isOpen,
  account,
  onClose,
  onCreate,
  onUpdate,
  shouldAskCreditCardBehaviour = false,
  onCreditCardBehaviourSelected,
}: AddAccountModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("on-budget");
  const [startingBalance, setStartingBalance] = useState("");
  const [creditCardBehaviour, setCreditCardBehaviour] = useState<CreditCardBehaviour>("normal");
  const [isCreditCardExplanationOpen, setIsCreditCardExplanationOpen] = useState(false);
  const isEditing = Boolean(account);
  const showCreditCardBehaviourChoice = !isEditing && type === "credit-card" && shouldAskCreditCardBehaviour;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (account) {
      setName(account.name);
      setType(account.type);
      setStartingBalance(formatStartingBalance(account.startingBalance));
      return;
    }

    setName("");
    setType("on-budget");
    setStartingBalance("");
    setCreditCardBehaviour("normal");
    setIsCreditCardExplanationOpen(false);
  }, [account, isOpen]);

  if (!isOpen) {
    return null;
  }

  function submit() {
    if (!name.trim()) {
      return;
    }

    if (account && onUpdate) {
      onUpdate({
        id: account.id,
        name: name.trim(),
        type,
      });
      onClose();
      return;
    }

    if (showCreditCardBehaviourChoice) {
      onCreditCardBehaviourSelected?.(creditCardBehaviour);
    }

    onCreate({
      name: name.trim(),
      type,
      startingBalance: Number(startingBalance || 0),
    });

    setName("");
    setType("on-budget");
    setStartingBalance("");
    setCreditCardBehaviour("normal");
    setIsCreditCardExplanationOpen(false);
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card add-account-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-account-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="add-account-title">{isEditing ? "Edit account" : "Add account"}</h2>
            <p className="muted">
              {isEditing
                ? "Rename the account or change how it participates in your budget."
                : "Create a new budget, credit card, or tracking account."}
            </p>
          </div>

          <button className="modal-close-button" type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="add-account-form">
          <label>
            <span>Account name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Everyday Account"
              autoFocus
            />
          </label>

          <label>
            <span>Account type</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as AccountType)}
            >
              <option value="on-budget">On-budget account</option>
              <option value="credit-card">Credit card</option>
              <option value="tracking">Tracking account</option>
            </select>
          </label>

          <label>
            <span>Starting balance</span>
            <MoneyInput
              value={Number(startingBalance || 0)}
              onCommit={(value) => setStartingBalance(value === 0 ? "" : value.toFixed(2))}
              emptyWhenZero
              placeholder="0.00"
              disabled={isEditing}
            />
          </label>


          {showCreditCardBehaviourChoice && (
            <section className="credit-card-behaviour-panel" aria-label="Credit card behaviour">
              <div>
                <strong>This is the first credit card in this budget.</strong>
                <p className="form-help-text">
                  This choice applies to every credit card in this budget, including cards you add later.
                </p>
              </div>

              <div className="credit-card-behaviour-options" role="radiogroup" aria-label="How should credit cards work?">
                <label className="credit-card-behaviour-option">
                  <input
                    type="radio"
                    name="credit-card-behaviour"
                    value="normal"
                    checked={creditCardBehaviour === "normal"}
                    onChange={() => setCreditCardBehaviour("normal")}
                  />
                  <span>
                    <strong>Treat credit cards like normal accounts</strong>
                    <small>Purchases increase the card balance. Payments reduce the balance.</small>
                  </span>
                </label>

                <label className="credit-card-behaviour-option">
                  <input
                    type="radio"
                    name="credit-card-behaviour"
                    value="payment-funding"
                    checked={creditCardBehaviour === "payment-funding"}
                    onChange={() => setCreditCardBehaviour("payment-funding")}
                  />
                  <span>
                    <strong>Reserve money for credit card payments</strong>
                    <small>Funded purchases set money aside for the next card payment.</small>
                  </span>
                </label>
              </div>

              <button
                className="button button-link credit-card-explanation-toggle"
                type="button"
                onClick={() => setIsCreditCardExplanationOpen((isOpen) => !isOpen)}
              >
                ⓘ What's the difference?
              </button>

              {isCreditCardExplanationOpen && (
                <div className="credit-card-behaviour-explanation">
                  <div>
                    <strong>Normal accounts</strong>
                    <p>
                      A $100 grocery purchase records $100 of grocery spending and increases the card balance.
                    </p>
                  </div>
                  <div>
                    <strong>Reserve money for payments</strong>
                    <p>
                      A funded $100 grocery purchase also reserves $100 so the money is ready for the card payment.
                    </p>
                  </div>
                </div>
              )}
            </section>
          )}

          {isEditing && (
            <p className="form-help-text">
              Starting balance is locked after account creation. Adjust the account balance with
              register transactions instead.
            </p>
          )}
        </div>

        <div className="modal-footer">
          <button className="button button-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button button-primary" type="button" onClick={submit}>
            {isEditing ? "Save changes" : "Add account"}
          </button>
        </div>
      </section>
    </div>
  );
}
