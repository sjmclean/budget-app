import { useMemo, useRef, useState } from "react";
import { useRegisterAutocompletePopupStyle } from "../useRegisterAutocompletePopupStyle";
import {
  getAutocompleteCompletion,
  rankAutocompleteOptions,
} from "../../ui/autocomplete/autocompleteEngine";
import type { SidebarAccount } from "../accountService";
import type { PayeeView } from "../payeeService";
import {
  buildPayeeAutocompleteOptions,
  getPayeeSelection,
  getPayeeSuggestionSection,
  getPayeeSuggestionText,
  type PayeeSelection,
} from "../registerPayeeAutocomplete";

export function PayeeInput({
  value,
  onChange,
  onPayeeIdChange,
  onTransferAccountIdChange,
  transferAccounts,
  payeeOptions,
  autoFocus,
  openOnFocus = false,
  onSelection,
  onCancel,
  onBlurOutside,
}: {
  value: string;
  onChange: (value: string) => void;
  onPayeeIdChange?: (payeeId: string | undefined) => void;
  onTransferAccountIdChange?: (accountId: string | undefined) => void;
  transferAccounts: SidebarAccount[];
  payeeOptions: PayeeView[];
  autoFocus?: boolean;
  openOnFocus?: boolean;
  onSelection?: (value: string) => void;
  onCancel?: () => void;
  onBlurOutside?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const autocompleteOptions = useMemo(
    () => buildPayeeAutocompleteOptions({ transferAccounts, payeeOptions }),
    [payeeOptions, transferAccounts],
  );

  const suggestions = useMemo(() => {
    if (showAllSuggestions || value.trim().length === 0) {
      return autocompleteOptions.map((option) => ({
        ...option,
        matchType: "all" as const,
      }));
    }

    return rankAutocompleteOptions({
      inputValue: value,
      options: autocompleteOptions,
      maxResults: 8,
    });
  }, [autocompleteOptions, showAllSuggestions, value]);

  const highlightedSuggestion =
    suggestions[
      Math.min(highlightedIndex, Math.max(suggestions.length - 1, 0))
    ];
  const ghostCompletion = getAutocompleteCompletion(
    value,
    highlightedSuggestion?.value,
  );
  const shouldShowSuggestions = isOpen && suggestions.length > 0;
  const shouldShowPopup = shouldShowSuggestions;
  const shouldShowGhost =
    shouldShowSuggestions && !showAllSuggestions && Boolean(ghostCompletion);
  const { anchorRef, popupStyle } =
    useRegisterAutocompletePopupStyle(shouldShowPopup);

  function selectSuggestion(selection: PayeeSelection) {
    onChange(selection.value);
    onPayeeIdChange?.(selection.payeeId);
    onTransferAccountIdChange?.(selection.transferAccountId);
    onSelection?.(selection.value);
    setIsOpen(false);
    setShowAllSuggestions(false);
    setHighlightedIndex(0);
  }

  function openSuggestionList(showAll = false) {
    setIsOpen(true);
    setShowAllSuggestions(showAll);
    setHighlightedIndex(0);
  }

  function closeSuggestionList() {
    setIsOpen(false);
    setShowAllSuggestions(false);
  }

  function setInputElement(element: HTMLInputElement | null) {
    inputRef.current = element;
    anchorRef.current = element;
  }

  function acceptHighlightedSuggestion() {
    if (!highlightedSuggestion) {
      return false;
    }

    selectSuggestion(getPayeeSelection(highlightedSuggestion));
    return true;
  }

  return (
    <div className="register-payee-autocomplete">
      <input
        ref={setInputElement}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          onPayeeIdChange?.(undefined);
          onTransferAccountIdChange?.(undefined);
          openSuggestionList(false);
        }}
        onFocus={() =>
          openSuggestionList(openOnFocus || value.trim().length === 0)
        }
        onBlur={() =>
          window.setTimeout(() => {
            if (!popupRef.current?.contains(document.activeElement)) {
              closeSuggestionList();
              onBlurOutside?.();
            }
          }, 120)
        }
        onKeyDown={(event) => {
          if (event.key === "Tab" && !event.shiftKey && shouldShowGhost) {
            acceptHighlightedSuggestion();
            return;
          }

          if (event.key === "ArrowRight" && shouldShowGhost) {
            const input = event.currentTarget;
            const cursorAtEnd =
              input.selectionStart === value.length &&
              input.selectionEnd === value.length;

            if (cursorAtEnd) {
              event.preventDefault();
              acceptHighlightedSuggestion();
              return;
            }
          }

          if (event.key === "ArrowDown" && suggestions.length > 0) {
            event.preventDefault();
            openSuggestionList(showAllSuggestions);
            setHighlightedIndex((current) =>
              shouldShowSuggestions && current < suggestions.length - 1
                ? current + 1
                : 0,
            );
            return;
          }

          if (event.key === "ArrowUp" && suggestions.length > 0) {
            event.preventDefault();
            openSuggestionList(showAllSuggestions);
            setHighlightedIndex((current) =>
              shouldShowSuggestions && current > 0
                ? current - 1
                : suggestions.length - 1,
            );
            return;
          }

          if (event.key === "Enter" && shouldShowSuggestions) {
            event.preventDefault();
            event.stopPropagation();
            acceptHighlightedSuggestion();
            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            closeSuggestionList();
            onCancel?.();
          }
        }}
        placeholder="Payee"
        autoFocus={autoFocus}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={shouldShowPopup}
      />

      <button
        type="button"
        className="register-combobox-arrow"
        aria-label="Show payee choices"
        aria-expanded={shouldShowPopup}
        onMouseDown={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
          openSuggestionList(true);
        }}
      >
        ▾
      </button>

      {shouldShowGhost ? (
        <div className="register-payee-ghost" aria-hidden="true">
          <span className="register-payee-ghost-typed">{value}</span>
          <span>{ghostCompletion}</span>
        </div>
      ) : null}

      {shouldShowPopup ? (
        <div
          ref={popupRef}
          className="register-payee-suggestions register-autocomplete-popup"
          role="listbox"
          style={popupStyle}
        >
          {suggestions.map((suggestion, index) => {
            const section = getPayeeSuggestionSection(suggestion);
            const previousSection =
              index > 0
                ? getPayeeSuggestionSection(suggestions[index - 1])
                : null;
            const showSection = section !== previousSection;
            const isTransfer = suggestion.metadata?.type === "transfer";

            return (
              <div
                key={suggestion.id}
                className="register-autocomplete-suggestion-block"
              >
                {showSection ? (
                  <div className="register-autocomplete-section-heading">
                    {section}
                  </div>
                ) : null}

                <button
                  type="button"
                  className={
                    index === highlightedIndex
                      ? "register-payee-suggestion register-payee-suggestion-active"
                      : "register-payee-suggestion"
                  }
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectSuggestion(getPayeeSelection(suggestion));
                  }}
                  role="option"
                  aria-selected={index === highlightedIndex}
                >
                  <span className="register-autocomplete-primary">
                    {isTransfer ? (
                      <span className="register-autocomplete-icon">↔</span>
                    ) : null}
                    <span>{getPayeeSuggestionText(suggestion)}</span>
                  </span>

                  {isTransfer ? null : (
                    <small>
                      {suggestion.metadata?.label ?? suggestion.label}
                    </small>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
