import { useEffect, useRef, useState } from "react";
import type { BudgetCategoryOption } from "../../budget/budgetViewTypes";
import type { LocalBudgetRuntimeClient } from "../../persistence/accountRegisterQueryContracts";

type ReconciliationPreview = Pick<LocalBudgetRuntimeClient, "previewReconciliation">;
type ReconciliationCommand = Pick<LocalBudgetRuntimeClient, "completeReconciliation" | "addTransaction" | "setTransactionsCleared">;

export function ReconciliationPanel({
  budgetId, accountId, currencyCode, categoryOptions, queries, commands, onComplete, onClose,
}: {
  budgetId: string;
  accountId: string;
  currencyCode: string;
  categoryOptions: BudgetCategoryOption[];
  queries: ReconciliationPreview;
  commands: ReconciliationCommand;
  onComplete?: () => void;
  onClose: () => void;
}) {
  const [statementDate, setStatementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [balanceText, setBalanceText] = useState("");
  const [preview, setPreview] = useState<{ clearedBalanceMinor: number; eligibleTransactionCount: number } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [showAdjustmentConfirmation, setShowAdjustmentConfirmation] = useState(false);
  const [showTransactionInfo, setShowTransactionInfo] = useState(false);
  const [adjustmentMemo, setAdjustmentMemo] = useState("Statement balance adjustment");
  const [adjustmentCategoryId, setAdjustmentCategoryId] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, busy]);

  useEffect(() => {
    let stale = false;
    setPreview(null);
    setFinished(false);
    setShowAdjustmentConfirmation(false);
    setError("");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(statementDate)) return;
    void queries.previewReconciliation({ budgetId, accountId, statementDate }).then((result) => {
      if (!stale) setPreview(result);
    }).catch((reason: unknown) => {
      if (!stale) setError(String(reason));
    });
    return () => { stale = true; };
  }, [queries, budgetId, accountId, statementDate]);

  const balanceIsValid = /^-?\d+(?:\.\d{1,2})?$/.test(balanceText.trim());
  const statementBalanceMinor = balanceIsValid ? Math.round(Number(balanceText) * 100) : null;
  const difference = preview && statementBalanceMinor !== null
    ? statementBalanceMinor - preview.clearedBalanceMinor : null;
  const currency = (minor: number) => new Intl.NumberFormat("en-AU", {
    style: "currency", currency: currencyCode,
  }).format(minor / 100);

  return (
    <div role="presentation" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 16 }}>
    <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Reconcile account" style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 24px 70px rgba(0,0,0,0.35)", padding: 24, width: "min(100%, 580px)", maxHeight: "90vh", overflowY: "auto", display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}><strong>Reconcile account</strong><button type="button" aria-label="Close reconciliation" disabled={busy} onClick={onClose}>✕</button></div>
      <p className="muted">Enter the closing balance and date shown on your bank statement. Clear transactions in the register until the difference is zero.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <label>Statement date{" "}
          <input type="date" value={statementDate} onChange={(event) => setStatementDate(event.target.value)} />
        </label>
        <label>Statement closing balance{" "}
          <input aria-label="Statement closing balance" inputMode="decimal" placeholder="0.00" value={balanceText}
            onChange={(event) => { setBalanceText(event.target.value); setFinished(false); setShowAdjustmentConfirmation(false); }} />
        </label>
      </div>
      {preview ? (
        <div role="status" aria-label="Reconciliation summary" style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 16, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
            <span className="muted">Statement closing balance</span>
            <strong style={{ fontVariantNumeric: "tabular-nums" }}>{statementBalanceMinor !== null ? currency(statementBalanceMinor) : "—"}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
            <span className="muted">Cleared balance at statement date</span>
            <strong style={{ fontVariantNumeric: "tabular-nums" }}>{currency(preview.clearedBalanceMinor)}</strong>
          </div>
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
            <strong>Difference</strong>
            <strong style={{ fontSize: "1.25rem", fontVariantNumeric: "tabular-nums" }}>{difference !== null ? currency(difference) : "—"}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", position: "relative" }}>
            <button type="button" aria-label="About transactions to reconcile" aria-expanded={showTransactionInfo}
              title="Transactions to reconcile" onClick={() => setShowTransactionInfo((value) => !value)}
              style={{ border: "1px solid var(--border)", borderRadius: "50%", width: 26, height: 26, padding: 0, cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
              i
            </button>
            {showTransactionInfo ? (
              <div role="note" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 1, width: "min(300px, 75vw)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--surface)", boxShadow: "0 8px 20px rgba(0,0,0,0.15)", fontSize: "0.875rem" }}>
                <strong>{preview.eligibleTransactionCount.toLocaleString()} transactions to reconcile</strong>
                <p style={{ margin: "6px 0 0" }}>Cleared, not-yet-reconciled transactions dated on or before the statement date. This is not the number of discrepancies.</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : <span className="muted">Loading statement-date balance…</span>}
      {error ? <p role="alert">{error}</p> : null}
      {finished ? <p role="status">Reconciliation completed and checkpoint saved.</p> : null}
      {difference !== null && difference !== 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          <p className="muted">Check for missing or incorrectly cleared transactions first. If the statement is correct, you may explicitly create an adjustment transaction for {currency(difference)}. This changes your account balance and is not performed automatically.</p>
          {!showAdjustmentConfirmation ? (
            <button type="button" disabled={busy} onClick={() => setShowAdjustmentConfirmation(true)}>
              Create balance adjustment…
            </button>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              <label>Adjustment memo{" "}
                <input aria-label="Adjustment memo" value={adjustmentMemo}
                  onChange={(event) => setAdjustmentMemo(event.target.value)} />
              </label>
              <label>Adjustment category{" "}
                <select aria-label="Adjustment category" value={adjustmentCategoryId} onChange={(event) => setAdjustmentCategoryId(event.target.value)}>
                  <option value="">Uncategorised</option>
                  {categoryOptions.filter((category) => !category.isArchived).map((category) => (
                    <option key={category.id} value={category.id}>{category.groupName} — {category.name}</option>
                  ))}
                </select>
              </label>
              <p>Confirm a {difference > 0 ? "deposit" : "withdrawal"} of <strong>{currency(Math.abs(difference))}</strong> dated {statementDate}. It will be saved as a separate, cleared transaction in the selected category. Uncategorised is the default. Choose a category now because reconciliation will lock the transaction.</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" disabled={busy || !adjustmentMemo.trim()} onClick={async () => {
                  if (difference === null || !Number.isSafeInteger(difference)) return;
                  setBusy(true);
                  setError("");
                  try {
                    const fresh = await queries.previewReconciliation({ budgetId, accountId, statementDate });
                    if (statementBalanceMinor === null || statementBalanceMinor - fresh.clearedBalanceMinor !== difference) {
                      setPreview(fresh);
                      setShowAdjustmentConfirmation(false);
                      throw new Error("The cleared balance changed. Review the new difference before adjusting.");
                    }
                    const selectedCategory = categoryOptions.find((category) => category.id === adjustmentCategoryId);
                    if (adjustmentCategoryId && !selectedCategory) throw new Error("The selected adjustment category is no longer available.");
                    const id = crypto.randomUUID();
                    await commands.addTransaction({
                      id, budgetId, accountId, date: statementDate,
                      amount: difference, payeeName: "Balance Adjustment",
                      categoryId: selectedCategory?.id,
                      categoryName: selectedCategory?.name,
                      inflowClassification: selectedCategory && difference > 0 ? "category-inflow" : undefined,
                      memo: adjustmentMemo.trim(),
                    });
                    await commands.setTransactionsCleared({ budgetId, transactionIds: [id], cleared: true });
                    setPreview(await queries.previewReconciliation({ budgetId, accountId, statementDate }));
                    setShowAdjustmentConfirmation(false);
                  } catch (reason) {
                    setError(String(reason));
                    void queries.previewReconciliation({ budgetId, accountId, statementDate }).then(setPreview).catch(() => undefined);
                  } finally {
                    setBusy(false);
                  }
                }}>Confirm adjustment</button>
                <button type="button" disabled={busy} onClick={() => setShowAdjustmentConfirmation(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
      <div>
        <button type="button" disabled={busy || !preview || difference !== 0 || !statementDate}
          onClick={async () => {
            if (statementBalanceMinor === null) return;
            setBusy(true);
            setError("");
            try {
              await commands.completeReconciliation({ budgetId, accountId, statementDate, statementBalanceMinor });
              setFinished(true);
              onComplete?.();
            } catch (reason) {
              setError(String(reason));
              setPreview(null);
              void queries.previewReconciliation({ budgetId, accountId, statementDate }).then(setPreview).catch(() => undefined);
            } finally {
              setBusy(false);
            }
          }}>
          {busy ? "Reconciling…" : "Finish reconciliation"}
        </button>
      </div>
    </section>
    </div>
  );
}
