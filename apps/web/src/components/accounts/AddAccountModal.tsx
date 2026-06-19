import { useState } from "react";

type AccountType = "on-budget" | "credit-card" | "tracking";

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    type: AccountType;
    startingBalance: number;
  }) => void;
}

function parseMoney(value: string) {
  const cleaned = value.replace(/[$,\s]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function AddAccountModal({
  isOpen,
  onClose,
  onCreate,
}: AddAccountModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("on-budget");
  const [startingBalance, setStartingBalance] = useState("");

  if (!isOpen) {
    return null;
  }

  function submit() {
    if (!name.trim()) {
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
            <h2 id="add-account-title">Add account</h2>
            <p className="muted">Create a new budget, credit card, or tracking account.</p>
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
            />
          </label>
        </div>

        <div className="modal-footer">
          <button className="button button-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button button-primary" type="button" onClick={submit}>
            Add account
          </button>
        </div>
      </section>
    </div>
  );
}
