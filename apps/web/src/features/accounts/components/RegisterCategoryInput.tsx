import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
  isSplitCategoryValue,
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

export interface RegisterInlineCategoryCreateInput {
  name: string;
  groupId?: string;
  groupName?: string;
}

export function RegisterCategoryInput({
  value,
  onChange,
  categoryOptions,
  includeSplitOption = true,
  autoFocus = false,
  openOnFocus = false,
  onCreateCategory,
}: {
  value: string;
  onChange: (value: string) => void;
  categoryOptions: BudgetCategoryOption[];
  includeSplitOption?: boolean;
  autoFocus?: boolean;
  openOnFocus?: boolean;
  onCreateCategory?: (
    input: RegisterInlineCategoryCreateInput,
  ) => Promise<BudgetCategoryOption>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [createGroupId, setCreateGroupId] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSavingCategory, setIsSavingCategory] = useState(false);

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

  const categoryGroups = useMemo(() => {
    const groups = new Map<
      string,
      { value: string; id?: string; name: string }
    >();

    for (const category of categoryOptions) {
      if (
        category.id === "__ready_to_assign__" ||
        category.isArchived ||
        !category.groupName.trim()
      ) {
        continue;
      }

      const key = category.groupId ?? category.groupName;
      if (!groups.has(key)) {
        groups.set(key, {
          value: category.groupId ?? `name:${category.groupName}`,
          id: category.groupId,
          name: category.groupName,
        });
      }
    }

    return [...groups.values()].sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
    );
  }, [categoryOptions]);

  const trimmedValue = value.trim();
  const hasExactCategoryMatch = categoryOptions.some(
    (category) =>
      !category.isArchived &&
      normaliseCategoryName(category.name) ===
        normaliseCategoryName(trimmedValue),
  );
  const canCreateCategory =
    Boolean(onCreateCategory) &&
    trimmedValue.length > 0 &&
    !isSplitCategoryValue(trimmedValue) &&
    !hasExactCategoryMatch;

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
  const shouldShowPopup =
    isOpen &&
    (suggestions.length > 0 || canCreateCategory || isCreatingCategory);
  const shouldShowGhost =
    shouldShowSuggestions &&
    !showAllSuggestions &&
    Boolean(ghostCompletion) &&
    !isCreatingCategory;
  const { anchorRef, popupStyle } = useRegisterAutocompletePopupStyle(
    shouldShowPopup,
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
    setIsCreatingCategory(false);
    setCreateError(null);
  }

  function openSuggestionList(showAll = false) {
    setIsOpen(true);
    setShowAllSuggestions(showAll);
    setHighlightedIndex(0);
  }

  function closeSuggestionList() {
    setIsOpen(false);
    setShowAllSuggestions(false);
    setIsCreatingCategory(false);
    setCreateError(null);
  }

  function beginCreateCategory() {
    if (!canCreateCategory) return;
    setIsCreatingCategory(true);
    setCreateError(null);
    setCreateGroupId(categoryGroups[0]?.value ?? "");
    setNewGroupName("");
    setIsOpen(true);
  }

  async function submitCreateCategory(event?: FormEvent) {
    event?.preventDefault();
    if (!onCreateCategory || !trimmedValue || isSavingCategory) return;

    const selectedGroup = categoryGroups.find(
      (group) => group.value === createGroupId,
    );
    const groupName =
      createGroupId === "__new__"
        ? newGroupName.trim()
        : selectedGroup?.name;

    if (!selectedGroup && createGroupId !== "__new__") {
      setCreateError("Choose a category group.");
      return;
    }

    if (createGroupId === "__new__" && !groupName) {
      setCreateError("Enter a new group name.");
      return;
    }

    setIsSavingCategory(true);
    setCreateError(null);

    try {
      const created = await onCreateCategory({
        name: trimmedValue,
        groupId:
          createGroupId !== "__new__" ? selectedGroup?.id : undefined,
        groupName,
      });
      selectSuggestion(created.name);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Unable to create category.",
      );
    } finally {
      setIsSavingCategory(false);
    }
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
        onBlur={() =>
          window.setTimeout(() => {
            if (!popupRef.current?.contains(document.activeElement)) {
              closeSuggestionList();
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

          if (
            event.key === "Enter" &&
            canCreateCategory &&
            !isCreatingCategory
          ) {
            event.preventDefault();
            beginCreateCategory();
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
        aria-expanded={shouldShowPopup}
      />
      <button
        type="button"
        className="register-combobox-arrow"
        aria-label="Show category choices"
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

          {canCreateCategory && !isCreatingCategory ? (
            <button
              type="button"
              className="register-category-create-option"
              onMouseDown={(event) => {
                event.preventDefault();
                beginCreateCategory();
              }}
            >
              <span aria-hidden="true">＋</span>
              <span>Create “{trimmedValue}”</span>
            </button>
          ) : null}

          {isCreatingCategory ? (
            <form
              className="register-category-create-panel"
              onSubmit={(event) => void submitCreateCategory(event)}
            >
              <strong>Create category</strong>
              <span className="register-category-create-name">
                {trimmedValue}
              </span>
              <label>
                <span>Category group</span>
                <select
                  value={createGroupId}
                  onChange={(event) => {
                    setCreateGroupId(event.target.value);
                    setCreateError(null);
                  }}
                  autoFocus
                >
                  <option value="">Choose a group</option>
                  {categoryGroups.map((group) => (
                    <option key={group.value} value={group.value}>
                      {group.name}
                    </option>
                  ))}
                  <option value="__new__">Create new group…</option>
                </select>
              </label>
              {createGroupId === "__new__" ? (
                <label>
                  <span>New group name</span>
                  <input
                    value={newGroupName}
                    onChange={(event) => {
                      setNewGroupName(event.target.value);
                      setCreateError(null);
                    }}
                    placeholder="Group name"
                  />
                </label>
              ) : null}
              {createError ? (
                <p className="register-category-create-error" role="alert">
                  {createError}
                </p>
              ) : null}
              <div className="register-category-create-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setIsCreatingCategory(false)}
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={isSavingCategory}
                >
                  {isSavingCategory ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
