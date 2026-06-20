import { useEffect, useState } from "react";

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
  onUpdate?: (input: {
    id: string;
    name: string;
    type: AccountType;
  }) => void;
}

function parseMoney(value: string) {
  const cleaned = value.replace(/[$,\s]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
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
}: AddAccountModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("on-budget");
  const [startingBalance, setStartingBalance] = useState("");
  const isEditing = Boolean(account);

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

    onCreate({
      name: name.trim(),
      type,
      startingBalance: parseMoney(startingBalance),
    });

    setName("");
    setType("on-budget");
    setStartingBalance("");
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
            <input
              value={startingBalance}
              onChange={(event) => setStartingBalance(event.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              disabled={isEditing}
            />
          </label>

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
