import { useEffect, useRef, useState } from "react";
import type { LocalBudgetRuntimeClient } from "../../persistence/accountRegisterQueryContracts";

type ReconciliationPreview = Pick<LocalBudgetRuntimeClient, "previewReconciliation">;
type ReconciliationCommand = Pick<LocalBudgetRuntimeClient, "completeReconciliation" | "addTransaction" | "setTransactionsCleared">;

export function ReconciliationPanel({
  budgetId, accountId, currencyCode, queries, commands, onComplete, onClose,
}: {
  budgetId: string;
  accountId: string;
  currencyCode: string;
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
  const [adjustmentMemo, setAdjustmentMemo] = useState("Statement balance adjustment");
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
        <div role="status">
          Cleared balance at statement date: <strong>{currency(preview.clearedBalanceMinor)}</strong>
          {" · "}Transactions to reconcile: <strong>{preview.eligibleTransactionCount}</strong>
          {difference !== null ? <>{" · "}Difference: <strong>{currency(difference)}</strong></> : null}
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
              <p>Confirm a {difference > 0 ? "deposit" : "withdrawal"} of <strong>{currency(Math.abs(difference))}</strong> dated {statementDate}. It will be saved as a separate, cleared Ready to Assign adjustment for the statement month, which may make Ready to Assign negative.</p>
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
                    const id = crypto.randomUUID();
                    await commands.addTransaction({
                      id, budgetId, accountId, date: statementDate,
                      amount: difference, payeeName: "Balance Adjustment",
                      incomeBudgetMonth: statementDate.slice(0, 7), inflowClassification: "income",
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
