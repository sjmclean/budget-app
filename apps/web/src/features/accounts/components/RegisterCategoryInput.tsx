import { useEffect, useMemo, useRef, useState } from "react";
import { useRegisterAutocompletePopupStyle } from "../useRegisterAutocompletePopupStyle";
import {
  getAutocompleteCompletion,
  rankAutocompleteOptions,
  type AutocompleteOption,
  type RankedAutocompleteOption,
} from "../../ui/autocomplete/autocompleteEngine";
import type { BudgetCategoryOption } from "../../budget/budgetViewTypes";
import { CategoryIcon } from "../../icons/CategoryIcon";
import {
  normaliseCategoryName,
  SPLIT_CATEGORY_LABEL,
} from "../registerCategoryMatching";

function getCategorySuggestionSection(
  suggestion: RankedAutocompleteOption<{
    label: string;
    groupName?: string;
    type: "category" | "special";
  }>,
) {
  return suggestion.metadata?.type === "special"
    ? "Special"
    : (suggestion.metadata?.groupName ?? suggestion.label ?? "Categories");
}

export function RegisterCategoryInput({
  value,
  onChange,
  categoryOptions,
  includeSplitOption = true,
  autoFocus = false,
  openOnFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  categoryOptions: BudgetCategoryOption[];
  includeSplitOption?: boolean;
  autoFocus?: boolean;
  openOnFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const autocompleteOptions = useMemo((): Array<
    AutocompleteOption<{
      label: string;
      groupName?: string;
      type: "category" | "special";
    }>
  > => {
    const categorySuggestions = categoryOptions
      .filter((category) => !category.isArchived)
      .map((category) => ({
        id: category.id,
        value: category.name,
        label: category.groupName,
        metadata: {
          label: category.groupName,
          groupName: category.groupName,
          type: "category" as const,
        },
      }));

    const splitSuggestion = includeSplitOption
      ? [
          {
            id: "__split",
            value: SPLIT_CATEGORY_LABEL,
            label: "Special",
            metadata: { label: "Special", type: "special" as const },
            ranking: { priority: 0 },
          },
        ]
      : [];

    return [...splitSuggestion, ...categorySuggestions];
  }, [categoryOptions, includeSplitOption]);

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
      normalise: normaliseCategoryName,
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
  const shouldShowGhost =
    shouldShowSuggestions && !showAllSuggestions && Boolean(ghostCompletion);
  const { anchorRef, popupStyle } = useRegisterAutocompletePopupStyle(
    shouldShowSuggestions,
  );

  useEffect(() => {
    if (!autoFocus) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();

    if (openOnFocus) {
      openSuggestionList(true);
    }
  }, [autoFocus, openOnFocus]);

  function setInputElement(element: HTMLInputElement | null) {
    inputRef.current = element;
    anchorRef.current = element;
  }

  function selectSuggestion(nextValue: string) {
    onChange(nextValue);
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

  function acceptHighlightedSuggestion() {
    if (!highlightedSuggestion) {
      return false;
    }

    selectSuggestion(highlightedSuggestion.value);
    return true;
  }

  return (
    <div className="register-payee-autocomplete">
      <input
        ref={setInputElement}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;

          onChange(nextValue);
          openSuggestionList(false);
        }}
        onFocus={() => openSuggestionList(openOnFocus || value.trim().length === 0)}
        onBlur={() => window.setTimeout(closeSuggestionList, 120)}
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
            setHighlightedIndex(
              (current) => (current + 1) % suggestions.length,
            );
            return;
          }

          if (event.key === "ArrowUp" && suggestions.length > 0) {
            event.preventDefault();
            openSuggestionList(showAllSuggestions);
            setHighlightedIndex((current) =>
              current === 0 ? suggestions.length - 1 : current - 1,
            );
            return;
          }

          if (event.key === "Enter" && shouldShowSuggestions) {
            event.preventDefault();
            acceptHighlightedSuggestion();
            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            closeSuggestionList();
          }
        }}
        placeholder="Category"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={shouldShowSuggestions}
      />
      <button
        type="button"
        className="register-combobox-arrow"
        aria-label="Show category choices"
        aria-expanded={shouldShowSuggestions}
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

      {shouldShowSuggestions ? (
        <div
          className="register-payee-suggestions register-autocomplete-popup register-category-suggestions"
          role="listbox"
          style={popupStyle}
        >
          {suggestions.map((suggestion, index) => {
            const section = getCategorySuggestionSection(suggestion);
            const previousSection =
              index > 0
                ? getCategorySuggestionSection(suggestions[index - 1])
                : null;
            const showSection = section !== previousSection;

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
                    selectSuggestion(suggestion.value);
                  }}
                  role="option"
                  aria-selected={index === highlightedIndex}
                >
                  <span className="register-autocomplete-primary register-category-option-primary">
                    {suggestion.metadata?.type === "category" ? (
                      <CategoryIcon categoryName={suggestion.value} />
                    ) : null}
                    <span>{suggestion.value}</span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
