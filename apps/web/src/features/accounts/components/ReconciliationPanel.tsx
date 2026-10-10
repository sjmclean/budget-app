import { useEffect, useState } from "react";
import type { LocalBudgetRuntimeClient } from "../../persistence/accountRegisterQueryContracts";

type ReconciliationClient = Pick<LocalBudgetRuntimeClient, "previewReconciliation" | "completeReconciliation">;

export function ReconciliationPanel({
  budgetId, accountId, currencyCode, engine, onComplete,
}: {
  budgetId: string;
  accountId: string;
  currencyCode: string;
  engine: ReconciliationClient;
  onComplete?: () => void;
}) {
  const [statementDate, setStatementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [balanceText, setBalanceText] = useState("");
  const [preview, setPreview] = useState<{ clearedBalanceMinor: number; eligibleTransactionCount: number } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let stale = false;
    setPreview(null);
    setFinished(false);
    setError("");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(statementDate)) return;
    void engine.previewReconciliation({ budgetId, accountId, statementDate }).then((result) => {
      if (!stale) setPreview(result);
    }).catch((reason: unknown) => {
      if (!stale) setError(String(reason));
    });
    return () => { stale = true; };
  }, [engine, budgetId, accountId, statementDate]);

  const balanceIsValid = /^-?\d+(?:\.\d{1,2})?$/.test(balanceText.trim());
  const statementBalanceMinor = balanceIsValid ? Math.round(Number(balanceText) * 100) : null;
  const difference = preview && statementBalanceMinor !== null
    ? statementBalanceMinor - preview.clearedBalanceMinor : null;
  const currency = (minor: number) => new Intl.NumberFormat("en-AU", {
    style: "currency", currency: currencyCode,
  }).format(minor / 100);

  return (
    <section aria-label="Reconcile account" style={{ padding: "12px 16px", display: "grid", gap: 10 }}>
      <strong>Reconcile account</strong>
      <p className="muted">Enter the closing balance and date shown on your bank statement. Clear transactions in the register until the difference is zero.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <label>Statement date{" "}
          <input type="date" value={statementDate} onChange={(event) => setStatementDate(event.target.value)} />
        </label>
        <label>Statement closing balance{" "}
          <input aria-label="Statement closing balance" inputMode="decimal" placeholder="0.00" value={balanceText}
            onChange={(event) => { setBalanceText(event.target.value); setFinished(false); }} />
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
      <div>
        <button type="button" disabled={busy || !preview || difference !== 0 || !statementDate}
          onClick={async () => {
            if (statementBalanceMinor === null) return;
            setBusy(true);
            setError("");
            try {
              await engine.completeReconciliation({ budgetId, accountId, statementDate, statementBalanceMinor });
              setFinished(true);
              onComplete?.();
            } catch (reason) {
              setError(String(reason));
              setPreview(null);
              void engine.previewReconciliation({ budgetId, accountId, statementDate }).then(setPreview).catch(() => undefined);
            } finally {
              setBusy(false);
            }
          }}>
          {busy ? "Reconciling…" : "Finish reconciliation"}
        </button>
      </div>
    </section>
  );
}
