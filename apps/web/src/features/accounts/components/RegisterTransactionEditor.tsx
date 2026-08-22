import {
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  AttachmentIndicator,
  type RegisterColumnId,
} from "./TransactionRow";
import { RegisterDateField } from "./RegisterDateField";
import { RegisterSplitEditor } from "./RegisterSplitEditor";
import { PayeeInput } from "./PayeeInput";
import { resolvePayeeForSubmission } from "../resolvePayeeForSubmission";
import {
  RegisterCategoryInput,
  type RegisterInlineCategoryCreateInput,
} from "./RegisterCategoryInput";
import {
  isRegisterColumnVisible,
  isRegisterEntryInputColumn,
} from "../registerColumns";
import type { RegisterLayoutMode } from "../registerLayoutMode";
import type { SidebarAccount } from "../accountService";
import type { PayeeView } from "../payeeService";
import type {
  NewRegisterTransactionInput,
  RegisterSplitLineView,
  RegisterTransactionView,
} from "../accountRegisterTypes";
import {
  createSplitLineDraft,
  getSplitBalanceStatus,
  isSplitDraftBalanced,
  parseRegisterMoney,
  splitDraftsFromTransaction,
  totalsFromSplitDrafts,
  type SplitLineDraft,
} from "../registerSplitDrafts";
import {
  findCategoryOption,
  isSplitCategoryValue,
  resolveRegisterTransactionEditCategory,
  SPLIT_CATEGORY_LABEL,
} from "../registerCategoryMatching";
import {
  buildNewRegisterTransactionInput,
  buildUpdateRegisterTransactionInput,
} from "../registerTransactionDrafts";
import type { BudgetCategoryOption } from "../../budget/budgetViewTypes";

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currencyCode,
  }).format(value);
}

export function TransactionEntryRow({
  initialDate,
  onSave,
  onSaveAndAddAnother,
  onCancel,
  categoryOptions,
  transferAccounts,
  currentAccount,
  payeeOptions,
  currencyCode,
  visibleColumns,
  visibleColumnIds,
  rowStyle,
  layoutMode,
  onCreateCategory,
  onCreatePayee,
}: {
  initialDate: string;
  categoryOptions: BudgetCategoryOption[];
  transferAccounts: SidebarAccount[];
  currentAccount: Pick<SidebarAccount, "id" | "name">;
  payeeOptions: PayeeView[];
  currencyCode: string;
  visibleColumns: Set<RegisterColumnId>;
  visibleColumnIds: readonly RegisterColumnId[];
  rowStyle: CSSProperties;
  layoutMode: RegisterLayoutMode;
  onSave: (
    input: NewRegisterTransactionInput,
    accountId: string,
  ) => Promise<void>;
  onSaveAndAddAnother: (
    input: NewRegisterTransactionInput,
    accountId: string,
  ) => Promise<void>;
  onCancel: () => void;
  onCreateCategory?: (
    input: RegisterInlineCategoryCreateInput,
  ) => Promise<BudgetCategoryOption>;
  onCreatePayee?: (name: string) => Promise<PayeeView>;
}) {
  const [date, setDate] = useState(initialDate);
  const [payee, setPayee] = useState("");
  const [payeeId, setPayeeId] = useState<string | undefined>(undefined);
  const [transferAccountId, setTransferAccountId] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState("");
  const [memo, setMemo] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [outflow, setOutflow] = useState("");
  const [inflow, setInflow] = useState("");
  const [splitLines, setSplitLines] = useState<SplitLineDraft[]>([]);
  const [mobileFlow, setMobileFlow] = useState<"expense" | "income">("expense");
  const [mobileStep, setMobileStep] = useState<"amount" | "details">("amount");
  const [mobilePicker, setMobilePicker] = useState<null | "date" | "payee" | "category" | "account" | "splits" | "split-category">(null);
  const [mobileSearch, setMobileSearch] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState(currentAccount.id);
  const [activeSplitId, setActiveSplitId] = useState<string | null>(null);
  const [mobilePositiveSplitIds, setMobilePositiveSplitIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mobileVisualViewport, setMobileVisualViewport] = useState(() => ({
    left: 0,
    width: typeof window === "undefined" ? 0 : window.innerWidth,
  }));

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateViewport = () => setMobileVisualViewport({
      left: viewport?.offsetLeft ?? 0,
      width: viewport?.width ?? window.innerWidth,
    });
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    return () => {
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  }, []);

  function buildInput(): NewRegisterTransactionInput | null {
    return buildNewRegisterTransactionInput({
      date,
      payee,
      payeeId,
      transferAccountId,
      category,
      memo,
      checkNumber,
      outflow,
      inflow,
      splitLines,
      categoryOptions,
    });
  }

  function clearForNext() {
    setPayee("");
    setPayeeId(undefined);
    setTransferAccountId(undefined);
    setCategory("");
    setMemo("");
    setCheckNumber("");
    setOutflow("");
    setInflow("");
    setSplitLines([]);
  }

  function handleCategoryChange(value: string) {
    if (isSplitCategoryValue(value)) {
      setCategory(SPLIT_CATEGORY_LABEL);
      setSplitLines((current) =>
        current.length > 0
          ? current
          : [createSplitLineDraft(), createSplitLineDraft()],
      );
      return;
    }

    setCategory(value);
  }

  async function save() {
    const input = buildInput();

    if (!input || isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const resolvedInput = await resolvePayeeForSubmission(
        input,
        onCreatePayee,
      );
      await onSave(resolvedInput, selectedAccountId);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Unable to save transaction.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function saveAndAddAnother() {
    const input = buildInput();

    if (!input || isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const resolvedInput = await resolvePayeeForSubmission(
        input,
        onCreatePayee,
      );
      await onSaveAndAddAnother(resolvedInput, selectedAccountId);
      clearForNext();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Unable to save transaction.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (layoutMode === "mobile") {
    const mobileAmount = mobileFlow === "expense" ? outflow : inflow;
    const updateMobileAmount = (value: string) => {
      if (mobileFlow === "expense") {
        setOutflow(value);
        setInflow("");
      } else {
        setInflow(value);
        setOutflow("");
      }
    };
    const amountDigits = mobileAmount.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(-10);
    const amountValue = Number(amountDigits || "0") / 100;
    const formattedMobileAmount = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
    }).format(amountValue);
    const enterAmountDigit = (digit: string) => {
      const nextDigits = `${amountDigits}${digit}`.replace(/^0+(?=\d)/, "").slice(-10);
      updateMobileAmount((Number(nextDigits || "0") / 100).toFixed(2));
    };
    const deleteAmountDigit = () => {
      const nextDigits = amountDigits.slice(0, -1);
      updateMobileAmount((Number(nextDigits || "0") / 100).toFixed(2));
    };
    const chooseMobileFlow = (flow: "expense" | "income") => {
      setMobileFlow(flow);
      if (flow === "expense") {
        setOutflow(inflow || outflow);
        setInflow("");
      } else {
        setInflow(outflow || inflow);
        setOutflow("");
      }
    };
    const searchTerm = mobileSearch.trim().toLocaleLowerCase();
    const visiblePayees = payeeOptions
      .filter((option) => !option.isArchived)
      .filter((option) => !searchTerm || option.name.toLocaleLowerCase().includes(searchTerm));

    const searchedMobilePayeeChoices = searchTerm
      ? [
          ...transferAccounts.map((account) => ({
            kind: "transfer" as const,
            id: account.id,
            label: `Transfer: ${account.name}`,
            searchValue: account.name,
            accountId: account.id,
            payeeId: undefined,
            defaultCategoryName: undefined,
          })),
          ...payeeOptions
            .filter((option) => !option.isArchived)
            .map((option) => ({
              kind: "payee" as const,
              id: option.id,
              label: option.name,
              searchValue: option.name,
              accountId: undefined,
              payeeId: option.id,
              defaultCategoryName: option.defaultCategoryName,
            })),
        ]
          .filter((choice) =>
            choice.searchValue.toLocaleLowerCase().includes(searchTerm),
          )
          .sort((left, right) => {
            const rank = (value: string) => {
              const normalised = value.toLocaleLowerCase();

              if (normalised === searchTerm) {
                return 0;
              }

              if (normalised.startsWith(searchTerm)) {
                return 1;
              }

              return 2;
            };

            const rankDifference =
              rank(left.searchValue) - rank(right.searchValue);

            if (rankDifference !== 0) {
              return rankDifference;
            }

            return left.searchValue.localeCompare(
              right.searchValue,
              undefined,
              { sensitivity: "base" },
            );
          })
      : [];

    const visibleCategories = categoryOptions
      .filter((option) => !option.isArchived)
      .filter((option) => !searchTerm || `${option.groupName} ${option.name}`.toLocaleLowerCase().includes(searchTerm));
    const selectableAccounts = [currentAccount, ...transferAccounts]
      .filter((account, index, accounts) => accounts.findIndex((candidate) => candidate.id === account.id) === index)
      .filter((account) => !searchTerm || account.name.toLocaleLowerCase().includes(searchTerm));
    const selectedAccountName =
      [currentAccount, ...transferAccounts].find((account) => account.id === selectedAccountId)?.name ??
      currentAccount.name;
    const completedMobileSplits = splitLines.filter((line) =>
      line.category.trim().length > 0 &&
      (parseRegisterMoney(line.outflow) > 0 || parseRegisterMoney(line.inflow) > 0),
    );
    const finishMobileSplits = () => {
      setSplitLines(completedMobileSplits);
      setCategory(completedMobileSplits.length > 0 ? SPLIT_CATEGORY_LABEL : "");
      setMobilePicker(null);
      setMobileSearch("");
    };
    const mobileCategoryLabel = completedMobileSplits.length > 0
      ? `Split (${completedMobileSplits.length} ${completedMobileSplits.length === 1 ? "category" : "categories"})`
      : category;

    if (mobilePicker) {
      const pickerTitle = mobilePicker === "splits"
        ? "Splits"
        : mobilePicker === "split-category"
          ? "Split category"
        : `${mobilePicker[0].toUpperCase()}${mobilePicker.slice(1)}`;
      return createPortal((
        <section
          className="mobile-transaction-sheet mobile-transaction-picker"
          role="dialog"
          aria-modal="true"
          style={{
            left: mobileVisualViewport.left,
            width: mobileVisualViewport.width,
            maxWidth: mobileVisualViewport.width,
          }}
        >
          <header className="mobile-transaction-sheet-header">
            <button type="button" onClick={() => {
              if (mobilePicker === "splits") {
                finishMobileSplits();
                return;
              }
              setMobilePicker(mobilePicker === "split-category" ? "splits" : null);
              setMobileSearch("");
            }}>‹ Transaction</button>
            <strong>{pickerTitle}</strong>
            {mobilePicker === "category" ? (
              <button type="button" onClick={() => {
                if (splitLines.length === 0) {
                  setSplitLines(() => [createSplitLineDraft(), createSplitLineDraft()]);
                }
                setMobilePicker("splits");
              }}>Split</button>
            ) : <span aria-hidden="true" />}
          </header>

          {mobilePicker !== "splits" && mobilePicker !== "date" ? (
            <div className="mobile-picker-search">
              <span aria-hidden="true">⌕</span>
              <input
                value={mobileSearch}
                onChange={(event) => setMobileSearch(event.target.value)}
                placeholder={`Search ${mobilePicker}s`}
                autoFocus
              />
            </div>
          ) : null}

          {mobilePicker === "date" ? (
            <div className="mobile-date-picker">
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                aria-label="Transaction date"
              />
              <button className="button button-primary" type="button" onClick={() => setMobilePicker(null)}>
                Done
              </button>
            </div>
          ) : null}

          {mobilePicker === "payee" ? (
            <div className="mobile-picker-list">
              {searchTerm ? (
                <>
                  {searchedMobilePayeeChoices.map((choice) => (
                    <button
                      key={`${choice.kind}-${choice.id}`}
                      type="button"
                      onClick={() => {
                        setPayee(choice.label);

                        if (choice.kind === "transfer") {
                          setPayeeId(undefined);
                          setTransferAccountId(choice.accountId);
                        } else {
                          setPayeeId(choice.payeeId);
                          setTransferAccountId(undefined);

                          if (choice.defaultCategoryName) {
                            setCategory(choice.defaultCategoryName);
                          }
                        }

                        setMobilePicker(null);
                        setMobileSearch("");
                      }}
                    >
                      <span>{choice.label}</span>
                      <span aria-hidden="true">›</span>
                    </button>
                  ))}

                  {searchedMobilePayeeChoices.length === 0 ? (
                    <p className="mobile-picker-empty">No matching payees.</p>
                  ) : null}
                </>
              ) : (
                <>
                  {transferAccounts.map((account) => (
                    <button
                      key={`transfer-${account.id}`}
                      type="button"
                      onClick={() => {
                        setPayee(`Transfer: ${account.name}`);
                        setPayeeId(undefined);
                        setTransferAccountId(account.id);
                        setMobilePicker(null);
                        setMobileSearch("");
                      }}
                    >
                      <span>{`Transfer: ${account.name}`}</span>
                      <span aria-hidden="true">›</span>
                    </button>
                  ))}

                  {visiblePayees.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setPayee(option.name);
                        setPayeeId(option.id);
                        setTransferAccountId(undefined);

                        if (option.defaultCategoryName) {
                          setCategory(option.defaultCategoryName);
                        }

                        setMobilePicker(null);
                        setMobileSearch("");
                      }}
                    >
                      <span>{option.name}</span>
                      <span aria-hidden="true">›</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          ) : null}

          {mobilePicker === "category" || mobilePicker === "split-category" ? (
            <div className="mobile-picker-list mobile-category-picker-list">
              {visibleCategories.map((option, index) => (
                <div key={option.id}>
                  {index === 0 || visibleCategories[index - 1]?.groupName !== option.groupName ? (
                    <h3>{option.groupName}</h3>
                  ) : null}
                  <button type="button" onClick={() => {
                    if (mobilePicker === "split-category" && activeSplitId) {
                      setSplitLines((lines) => lines.map((line) => line.id === activeSplitId
                        ? { ...line, category: option.name, categoryId: option.id }
                        : line));
                      setMobilePicker("splits");
                    } else {
                      setCategory(option.name);
                      setSplitLines([]);
                      setMobilePicker(null);
                    }
                    setMobileSearch("");
                  }}>
                    <span>{option.name}</span><span aria-hidden="true">›</span>
                  </button>
                </div>
              ))}
              {visibleCategories.length === 0 ? <p className="mobile-picker-empty">No matching categories.</p> : null}
            </div>
          ) : null}

          {mobilePicker === "account" ? (
            <div className="mobile-picker-list">
              {selectableAccounts.map((account) => (
                <button key={account.id} type="button" onClick={() => {
                  setSelectedAccountId(account.id);
                  setMobilePicker(null);
                  setMobileSearch("");
                }}>
                  <span>{account.name}</span>
                  <span>{account.id === selectedAccountId ? "✓" : "›"}</span>
                </button>
              ))}
            </div>
          ) : null}

          {mobilePicker === "splits" ? (
            <div className="mobile-split-picker">
              <div className="mobile-split-list">
                {splitLines.map((line, index) => {
                  const lineIsInflow =
                    mobilePositiveSplitIds.has(line.id) || Boolean(line.inflow);
                  return (
                  <div className="mobile-split-row" key={line.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSplitId(line.id);
                        setMobilePicker("split-category");
                      }}
                    >
                      <span>{line.category || `Split ${index + 1}: choose category`}</span>
                      <span aria-hidden="true">›</span>
                    </button>
                    <input
                      value={line.outflow || line.inflow}
                      onChange={(event) => setSplitLines((lines) => lines.map((candidate) =>
                        candidate.id === line.id
                          ? {
                              ...candidate,
                              outflow: lineIsInflow ? "" : event.target.value,
                              inflow: lineIsInflow ? event.target.value : "",
                            }
                          : candidate))}
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-label={`Split ${index + 1} amount`}
                    />
                    <button
                      className={`mobile-split-sign ${lineIsInflow ? "mobile-split-sign-positive" : "mobile-split-sign-negative"}`}
                      type="button"
                      onClick={() => {
                        setSplitLines((lines) => lines.map((candidate) => {
                          if (candidate.id !== line.id) return candidate;
                          const amount = candidate.outflow || candidate.inflow;
                          return lineIsInflow
                            ? { ...candidate, outflow: amount, inflow: "" }
                            : { ...candidate, outflow: "", inflow: amount };
                        }));
                        setMobilePositiveSplitIds((current) => {
                          const next = new Set(current);
                          if (lineIsInflow) {
                            next.delete(line.id);
                          } else {
                            next.add(line.id);
                          }
                          return next;
                        });
                      }}
                      aria-label={`${lineIsInflow ? "Make negative" : "Make positive"} split ${index + 1}`}
                    >{lineIsInflow ? "+" : "−"}</button>
                  </div>
                  );
                })}
                <button
                  className="mobile-split-add"
                  type="button"
                  onClick={() => setSplitLines((lines) => [...lines, createSplitLineDraft()])}
                >
                  + Add another split
                </button>
              </div>
              <div className="mobile-split-remaining">
                Remaining
                <strong>{formatMoney(getSplitBalanceStatus({
                  parentOutflow: parseRegisterMoney(outflow),
                  parentInflow: parseRegisterMoney(inflow),
                  splitOutflow: totalsFromSplitDrafts(splitLines).outflow,
                  splitInflow: totalsFromSplitDrafts(splitLines).inflow,
                }).remaining, currencyCode)}</strong>
              </div>
              <button className="button button-primary" type="button" onClick={() => {
                finishMobileSplits();
              }}>Done</button>
            </div>
          ) : null}
        </section>
      ), document.body);
    }

    return createPortal((
      <section
        className={`mobile-transaction-sheet mobile-transaction-step-${mobileStep}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-transaction-sheet-title"
        style={{
          left: mobileVisualViewport.left,
          width: mobileVisualViewport.width,
          maxWidth: mobileVisualViewport.width,
        }}
      >
        <header className="mobile-transaction-sheet-header">
          <button
            type="button"
            onClick={mobileStep === "details" ? () => setMobileStep("amount") : onCancel}
          >
            {mobileStep === "details" ? "‹ Amount" : "Cancel"}
          </button>
          <strong id="mobile-transaction-sheet-title">Add transaction</strong>
          {mobileStep === "details" ? (
            <button type="button" onClick={() => void save()}>Save</button>
          ) : <span aria-hidden="true" />}
        </header>

        <div className={`mobile-transaction-amount mobile-transaction-amount-${mobileFlow}`}>
          <span>{mobileFlow === "expense" ? "Expense" : "Income"}</span>
          <output aria-label="Transaction amount">{formattedMobileAmount}</output>
        </div>

        <div className="mobile-transaction-flow" role="group" aria-label="Transaction type">
          <button
            className={mobileFlow === "expense" ? "active expense" : ""}
            type="button"
            onClick={() => chooseMobileFlow("expense")}
          >
            Expense
          </button>
          <button
            className={mobileFlow === "income" ? "active income" : ""}
            type="button"
            onClick={() => chooseMobileFlow("income")}
          >
            Income
          </button>
        </div>

        {mobileStep === "amount" ? (
          <div className="mobile-transaction-keypad" role="group" aria-label="Amount keypad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
              <button key={digit} type="button" onClick={() => enterAmountDigit(digit)}>
                {digit}
              </button>
            ))}
            <button type="button" onClick={deleteAmountDigit} aria-label="Delete last digit">⌫</button>
            <button type="button" onClick={() => enterAmountDigit("0")}>0</button>
            <button
              className="mobile-transaction-next"
              type="button"
              onClick={() => setMobileStep("details")}
            >
              Next ›
            </button>
          </div>
        ) : (
        <div className="mobile-transaction-fields">
          <button
            className="mobile-transaction-field mobile-transaction-choice"
            type="button"
            onClick={() => setMobilePicker("date")}
          >
            <span>Date</span>
            <strong>{new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T00:00:00`))} <span aria-hidden="true">›</span></strong>
          </button>
          <button
            className="mobile-transaction-field mobile-transaction-choice"
            type="button"
            onClick={() => setMobilePicker("payee")}
          >
            <span>Payee</span>
            <strong className={payee ? "" : "placeholder"}>{payee || "Choose a payee"} <span aria-hidden="true">›</span></strong>
          </button>
          <button
            className="mobile-transaction-field mobile-transaction-choice"
            type="button"
            onClick={() => setMobilePicker("category")}
          >
            <span>Category</span>
            <strong className={mobileCategoryLabel ? "" : "placeholder"}>
              {mobileCategoryLabel || "Choose a category"} <span aria-hidden="true">›</span>
            </strong>
          </button>
          <button
            className="mobile-transaction-field mobile-transaction-choice"
            type="button"
            onClick={() => setMobilePicker("account")}
          >
            <span>Account</span>
            <strong>{selectedAccountName} <span aria-hidden="true">›</span></strong>
          </button>
          <label className="mobile-transaction-field">
            <span>Memo</span>
            <input
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              placeholder="Optional note"
            />
          </label>
          <details className="mobile-transaction-more">
            <summary>More details</summary>
            <label className="mobile-transaction-field">
              <span>Check number</span>
              <input
                value={checkNumber}
                onChange={(event) => setCheckNumber(event.target.value)}
                placeholder="Optional"
              />
            </label>
          </details>
        </div>
        )}

        {mobileStep === "details" ? (
        <footer className="mobile-transaction-sheet-footer">
          {saveError ? (
            <p className="register-category-create-error" role="alert">
              {saveError}
            </p>
          ) : null}
          <button
            className="button button-primary"
            type="button"
            disabled={isSaving}
            onClick={() => void save()}
          >
            Save transaction
          </button>
        </footer>
        ) : null}
      </section>
    ), document.body);
  }

  return (
    <>
      <div
        className="register-entry-row-active register-entry-row-workflow"
        style={rowStyle}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onCancel();
          }
        }}
      >
        {visibleColumnIds.map((columnId) => {
          if (!isRegisterEntryInputColumn(columnId)) {
            return (
              <span
                aria-hidden="true"
                className="register-entry-placeholder-cell"
                key={columnId}
              />
            );
          }

          if (columnId === "date") {
            return (
              <RegisterDateField
                key={columnId}
                value={date}
                onChange={setDate}
              />
            );
          }

          if (columnId === "payee") {
            return (
              <PayeeInput
                key={columnId}
                value={payee}
                onChange={(value) => {
                  setPayee(value);
                  setPayeeId(undefined);
                setTransferAccountId(undefined);
                }}
                onPayeeIdChange={setPayeeId}
                onTransferAccountIdChange={setTransferAccountId}
                onSelection={(value) => {
                  const selected = payeeOptions.find((option) => option.name === value);
                  if ((!category || category === "Uncategorised") && selected?.defaultCategoryName) {
                    setCategory(selected.defaultCategoryName);
                  }
                }}
                transferAccounts={transferAccounts}
                payeeOptions={payeeOptions}
                autoFocus
              />
            );
          }

          if (columnId === "category") {
            return (
              <RegisterCategoryInput
                key={columnId}
                value={category}
                onChange={handleCategoryChange}
                categoryOptions={categoryOptions}
                onCreateCategory={onCreateCategory}
              />
            );
          }

          if (columnId === "memo") {
            return (
              <input
                key={columnId}
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                placeholder="Memo"
              />
            );
          }

          if (columnId === "checkNumber") {
            return (
              <input
                key={columnId}
                value={checkNumber}
                onChange={(event) => setCheckNumber(event.target.value)}
                placeholder="Check #"
              />
            );
          }

          if (columnId === "outflow") {
            return (
              <input
                className="register-money-input"
                key={columnId}
                value={outflow}
                onChange={(event) => setOutflow(event.target.value)}
                placeholder="Outflow"
                inputMode="decimal"
              />
            );
          }

          if (columnId === "inflow") {
            return (
              <input
                className="register-money-input"
                key={columnId}
                value={inflow}
                onChange={(event) => setInflow(event.target.value)}
                placeholder="Inflow"
                inputMode="decimal"
              />
            );
          }

          return null;
        })}
      </div>

      {splitLines.length === 0 ? (
        <div className="register-entry-actions-panel register-entry-actions-panel-commit-only">
          {saveError ? (
            <p className="register-category-create-error" role="alert">
              {saveError}
            </p>
          ) : null}
          <div className="register-entry-actions register-entry-commit-actions">
            <button
              className="button button-primary"
              type="button"
              disabled={isSaving}
              onClick={() => void saveAndAddAnother()}
            >
              Save & add another
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void save()}
            >
              Save
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <RegisterSplitEditor
        splitLines={splitLines}
        setSplitLines={setSplitLines}
        categoryOptions={categoryOptions}
        parentOutflow={parseRegisterMoney(outflow)}
        parentInflow={parseRegisterMoney(inflow)}
        currencyCode={currencyCode}
        visibleColumnIds={visibleColumnIds}
        rowStyle={rowStyle}
        layoutMode={layoutMode}
        onCreateCategory={onCreateCategory}
      >
        {saveError ? (
          <p className="register-category-create-error" role="alert">
            {saveError}
          </p>
        ) : null}
        <button
          className="button button-primary"
          type="button"
          onClick={() => void saveAndAddAnother()}
          disabled={
            !isSplitDraftBalanced(
              parseRegisterMoney(outflow),
              parseRegisterMoney(inflow),
              splitLines,
            )
          }
        >
          Save & add another
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void save()}
          disabled={
            !isSplitDraftBalanced(
              parseRegisterMoney(outflow),
              parseRegisterMoney(inflow),
              splitLines,
            )
          }
        >
          Save
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={onCancel}
        >
          Cancel
        </button>
      </RegisterSplitEditor>
    </>
  );
}

export function TransactionEditRow({
  transaction,
  onSave,
  onCancel,
  onManageTransactionAttachments,
  categoryOptions,
  transferAccounts,
  payeeOptions,
  currencyCode,
  visibleColumns,
  visibleColumnIds,
  rowStyle,
  layoutMode,
  autoFocusField = "date",
  onCreatePayee,
}: {
  transaction: RegisterTransactionView;
  categoryOptions: BudgetCategoryOption[];
  transferAccounts: SidebarAccount[];
  payeeOptions: PayeeView[];
  currencyCode: string;
  onSave: (input: {
    id: string;
    date: string;
    payee: string;
    payeeId?: string;
    category: string;
    categoryId?: string;
    transferAccountId?: string;
    memo?: string;
    checkNumber?: string;
    inflow: number;
    outflow: number;
    splitLines?: RegisterSplitLineView[];
  }) => Promise<void>;
  onCancel: () => void;
  onManageTransactionAttachments: (transactionId: string) => void;
  visibleColumns: Set<RegisterColumnId>;
  visibleColumnIds: readonly RegisterColumnId[];
  rowStyle: CSSProperties;
  layoutMode: RegisterLayoutMode;
  autoFocusField?: "date" | "category";
  onCreatePayee?: (name: string) => Promise<PayeeView>;
}) {
  const [date, setDate] = useState(transaction.date);
  const [payee, setPayee] = useState(transaction.payee);
  const [payeeId, setPayeeId] = useState<string | undefined>(
    transaction.payeeId,
  );
  const [transferAccountId, setTransferAccountId] = useState<string | undefined>(
    transaction.transferAccountId,
  );
  const initialSplitLines = splitDraftsFromTransaction(transaction);
  const [category, setCategory] = useState(
    resolveRegisterTransactionEditCategory(
      transaction.category,
      initialSplitLines.length,
    ),
  );
  const [memo, setMemo] = useState(transaction.memo ?? "");
  const [checkNumber, setCheckNumber] = useState(transaction.checkNumber ?? "");
  const [outflow, setOutflow] = useState(
    transaction.outflow ? transaction.outflow.toFixed(2) : "",
  );
  const [inflow, setInflow] = useState(
    transaction.inflow ? transaction.inflow.toFixed(2) : "",
  );
  const [splitLines, setSplitLines] = useState<SplitLineDraft[]>(
    initialSplitLines,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function handleCategoryChange(value: string) {
    if (isSplitCategoryValue(value)) {
      setCategory(SPLIT_CATEGORY_LABEL);
      setSplitLines((current) =>
        current.length > 0
          ? current
          : [createSplitLineDraft(), createSplitLineDraft()],
      );
      return;
    }

    setCategory(value);
  }

  function toggleSplitEditor() {
    setSplitLines((current) => {
      if (current.length > 0) {
        setCategory((currentCategory) =>
          isSplitCategoryValue(currentCategory) ? "" : currentCategory,
        );
        return [];
      }

      setCategory(SPLIT_CATEGORY_LABEL);
      return [createSplitLineDraft(), createSplitLineDraft()];
    });
  }

  async function save() {
    const input = buildUpdateRegisterTransactionInput({
      id: transaction.id,
      date,
      payee,
      payeeId,
      transferAccountId,
      category,
      memo,
      checkNumber,
      outflow,
      inflow,
      splitLines,
      categoryOptions,
    });

    if (!input || isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const resolvedInput = await resolvePayeeForSubmission(
        input,
        onCreatePayee,
      );
      await onSave(resolvedInput);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Unable to save transaction.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const outflowColumnIndex = visibleColumnIds.indexOf("outflow");
  const inflowColumnIndex = visibleColumnIds.indexOf("inflow");
  const editActionGridColumn =
    outflowColumnIndex >= 0 && inflowColumnIndex >= outflowColumnIndex
      ? `${outflowColumnIndex + 1} / ${inflowColumnIndex + 2}`
      : "1 / -1";

  return (
    <>
      <div
        className="register-row register-row-editing"
        style={rowStyle}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !(event.target instanceof HTMLTextAreaElement)
          ) {
            void save();
          }

          if (event.key === "Escape") {
            onCancel();
          }
        }}
      >
        <span className="register-checkbox" aria-hidden="true" />
        <RegisterDateField
          value={date}
          onChange={setDate}
          autoFocus={autoFocusField === "date"}
        />
        {isRegisterColumnVisible("tags", visibleColumns) ? (
          <span className="register-entry-placeholder-cell" aria-hidden="true" />
        ) : null}
        {isRegisterColumnVisible("attachments", visibleColumns) ? (
          <AttachmentIndicator
            count={transaction.attachmentCount}
            onClick={() => onManageTransactionAttachments(transaction.id)}
          />
        ) : null}
        <PayeeInput
          value={payee}
          onChange={(value) => {
            setPayee(value);
            setPayeeId(undefined);
          setTransferAccountId(undefined);
          }}
          onPayeeIdChange={setPayeeId}
          onTransferAccountIdChange={setTransferAccountId}
          onSelection={(value) => {
            const selected = payeeOptions.find((option) => option.name === value);
            if ((!category || category === "Uncategorised") && selected?.defaultCategoryName) {
              setCategory(selected.defaultCategoryName);
            }
          }}
          transferAccounts={transferAccounts}
          payeeOptions={payeeOptions}
        />
        <RegisterCategoryInput
          value={category}
          onChange={handleCategoryChange}
          categoryOptions={categoryOptions}
          autoFocus={autoFocusField === "category"}
          openOnFocus={autoFocusField === "category"}
        />
        {isRegisterColumnVisible("memo", visibleColumns) ? (
          <input
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="Memo"
          />
        ) : null}
        {isRegisterColumnVisible("checkNumber", visibleColumns) ? (
          <input
            value={checkNumber}
            onChange={(event) => setCheckNumber(event.target.value)}
            placeholder="Check #"
          />
        ) : null}
        <input
          className="register-money-input"
          value={outflow}
          onChange={(event) => setOutflow(event.target.value)}
          placeholder="Outflow"
          inputMode="decimal"
        />
        <input
          className="register-money-input"
          value={inflow}
          onChange={(event) => setInflow(event.target.value)}
          placeholder="Inflow"
          inputMode="decimal"
        />
      </div>
      {splitLines.length > 0 ? (
        <RegisterSplitEditor
          splitLines={splitLines}
          setSplitLines={setSplitLines}
          categoryOptions={categoryOptions}
          parentOutflow={parseRegisterMoney(outflow)}
          parentInflow={parseRegisterMoney(inflow)}
          currencyCode={currencyCode}
          visibleColumnIds={visibleColumnIds}
          rowStyle={rowStyle}
          layoutMode={layoutMode}
        >
          {saveError ? (
            <p className="register-category-create-error" role="alert">
              {saveError}
            </p>
          ) : null}
          <button
            className="button button-primary"
            type="button"
            onClick={() => void save()}
            disabled={
              !isSplitDraftBalanced(
                parseRegisterMoney(outflow),
                parseRegisterMoney(inflow),
                splitLines,
              )
            }
          >
            Save
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
        </RegisterSplitEditor>
      ) : (
        <div className="register-edit-actions-panel" style={rowStyle}>
          {saveError ? (
            <p className="register-category-create-error" role="alert">
              {saveError}
            </p>
          ) : null}
          <div
            className="register-edit-actions register-edit-commit-actions"
            style={{ gridColumn: editActionGridColumn }}
          >
            <button
              className="button button-primary"
              type="button"
              onClick={() => void save()}
            >
              Save
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
