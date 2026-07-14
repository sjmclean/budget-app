import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import {
  TransactionTagIconGraphic,
  transactionTagIconOptions,
} from "./transactionTagIcons";
import type { TransactionTagIcon } from "./transactionTagIconTypes";
import type { TransactionTagColour } from "./transactionTagTypes";
import { transactionTagColourOptions } from "./transactionTagColours";

interface TransactionTagAppearancePickerProps {
  colour: TransactionTagColour;
  icon?: TransactionTagIcon;
  label: string;
  onChange: (appearance: {
    colour: TransactionTagColour;
    icon: TransactionTagIcon | null;
  }) => void;
}

export function TransactionTagAppearancePicker({
  colour,
  icon,
  label,
  onChange,
}: TransactionTagAppearancePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draftColour, setDraftColour] = useState(colour);
  const [draftIcon, setDraftIcon] = useState<TransactionTagIcon | undefined>(icon);

  const filteredIcons = useMemo(() => {
    const normalised = query.trim().toLocaleLowerCase();
    return normalised
      ? transactionTagIconOptions.filter((option) =>
          option.label.toLocaleLowerCase().includes(normalised),
        )
      : transactionTagIconOptions;
  }, [query]);

  function openPicker() {
    setDraftColour(colour);
    setDraftIcon(icon);
    setQuery("");
    setIsOpen(true);
  }

  function save() {
    onChange({
      colour: draftColour,
      icon: draftIcon ?? null,
    });
    setIsOpen(false);
  }

  return (
    <>
      <button
        className="transaction-tag-appearance-button"
        type="button"
        onClick={openPicker}
        aria-label={`Choose icon and colour for ${label}`}
        title="Choose icon and colour"
      >
        <span
          className="transaction-tag-appearance-preview"
          style={{ color: `var(--tag-${colour})` }}
        >
          <TransactionTagIconGraphic icon={icon} size={18} aria-hidden="true" />
        </span>
      </button>

      {isOpen ? (
        <div
          className="transaction-tag-appearance-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <section
            className="transaction-tag-appearance-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Select icon and colour for ${label}`}
          >
            <header className="transaction-tag-appearance-header">
              <h3>Select Icon</h3>
              <button
                className="transaction-tag-appearance-close"
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close icon picker"
              >
                <X size={20} />
              </button>
            </header>

            <label className="transaction-tag-icon-search">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search for more icons"
                autoFocus
              />
            </label>

            <div className="transaction-tag-icon-grid" role="listbox" aria-label="Tag icons">
              {filteredIcons.map((option) => (
                <button
                  className={`transaction-tag-icon-option${
                    draftIcon === option.value ? " transaction-tag-icon-option-selected" : ""
                  }`}
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={draftIcon === option.value}
                  aria-label={option.label}
                  title={option.label}
                  onClick={() => setDraftIcon(option.value)}
                  style={{ color: `var(--tag-${draftColour})` }}
                >
                  <option.icon size={21} aria-hidden="true" />
                </button>
              ))}
            </div>

            <div className="transaction-tag-appearance-divider" />

            <div className="transaction-tag-colour-palette" aria-label="Tag colour">
              <span>Colour</span>
              {transactionTagColourOptions.map((option) => (
                <button
                  className={`transaction-tag-colour-option${
                    draftColour === option.value ? " transaction-tag-colour-option-selected" : ""
                  }`}
                  key={option.value}
                  type="button"
                  aria-label={option.label}
                  title={option.label}
                  onClick={() => setDraftColour(option.value)}
                  style={{ backgroundColor: option.swatch }}
                />
              ))}
            </div>

            <footer className="transaction-tag-appearance-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDraftIcon(undefined)}
              >
                Clear icon
              </Button>
              <Button type="button" onClick={save}>Done</Button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
