import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import {
  clearImportDiagnosticSessions,
  deleteImportDiagnosticSession,
  listImportDiagnosticSessions,
  serialiseImportDiagnosticSession,
  type ImportDiagnosticCandidateOutcome,
  type ImportDiagnosticSessionRecord,
} from "../features/accounts/transactionImportDiagnostics";
import { useDeveloperPerformanceMode } from "../features/settings/useDeveloperPerformanceMode";

const outcomes: Array<ImportDiagnosticCandidateOutcome | "all"> = [
  "all",
  "imported",
  "matched",
  "skipped",
  "invalid",
  "pending",
];

function downloadJson(record: ImportDiagnosticSessionRecord) {
  const blob = new Blob([serialiseImportDiagnosticSession(record)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `import-diagnostic-${record.id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ImportDiagnosticsPage() {
  const navigate = useNavigate();
  const enabled = useDeveloperPerformanceMode();
  const [sessions, setSessions] = useState(() => listImportDiagnosticSessions());
  const [selectedId, setSelectedId] = useState<string | null>(() => sessions[0]?.id ?? null);
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "failed">("all");
  const [outcomeFilter, setOutcomeFilter] = useState<ImportDiagnosticCandidateOutcome | "all">("all");
  const [query, setQuery] = useState("");

  const filteredSessions = useMemo(
    () => sessions.filter((session) => statusFilter === "all" || session.status === statusFilter),
    [sessions, statusFilter],
  );
  const selected = sessions.find((session) => session.id === selectedId) ?? filteredSessions[0] ?? null;
  const candidates = useMemo(() => {
    if (!selected) return [];
    const needle = query.trim().toLowerCase();
    return selected.candidates.filter((candidate) => {
      if (outcomeFilter !== "all" && candidate.outcome !== outcomeFilter) return false;
      if (!needle) return true;
      return [candidate.sourcePayee, candidate.proposal.payee, candidate.sourceDate, String(candidate.rowNumber)]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [outcomeFilter, query, selected]);

  if (!enabled) {
    return (
      <main className="settings-page">
        <Card className="settings-section-card">
          <h1>Import diagnostics unavailable</h1>
          <p className="muted">Enable Developer performance mode in Settings to access importer diagnostics.</p>
          <Button type="button" onClick={() => navigate("/settings")}>Open settings</Button>
        </Card>
      </main>
    );
  }

  return (
    <main className="settings-page import-diagnostics-page">
      <section className="settings-page-header">
        <div>
          <p className="eyebrow">Developer</p>
          <h1>Import diagnostics</h1>
          <p className="muted">Inspect persisted completed and failed import traces.</p>
        </div>
        <Button type="button" variant="ghost" onClick={() => navigate("/settings")}>Close</Button>
      </section>

      <div className="import-diagnostics-toolbar">
        <select className="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
          <option value="all">All sessions</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
        <select className="select" value={outcomeFilter} onChange={(event) => setOutcomeFilter(event.target.value as typeof outcomeFilter)}>
          {outcomes.map((outcome) => <option key={outcome} value={outcome}>{outcome === "all" ? "All candidate outcomes" : outcome}</option>)}
        </select>
        <input className="settings-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter payee, date, or row" />
        <Button type="button" variant="secondary" onClick={() => { clearImportDiagnosticSessions(); setSessions([]); setSelectedId(null); }}>Clear all</Button>
      </div>

      <div className="import-diagnostics-layout">
        <Card className="import-diagnostics-session-list">
          <h2>Sessions</h2>
          {filteredSessions.length === 0 ? <p className="muted">No diagnostic sessions recorded.</p> : filteredSessions.map((session) => (
            <button key={session.id} type="button" className={`import-diagnostics-session${selected?.id === session.id ? " active" : ""}`} onClick={() => setSelectedId(session.id)}>
              <strong>{session.fileName ?? "Unnamed import"}</strong>
              <span>{session.accountName} · {session.status}</span>
              <small>{new Date(session.capturedAt).toLocaleString()}</small>
            </button>
          ))}
        </Card>

        <Card className="import-diagnostics-detail">
          {!selected ? <p className="muted">Select a diagnostic session.</p> : (
            <>
              <div className="settings-section-header">
                <div>
                  <p className="eyebrow">{selected.status}</p>
                  <h2>{selected.fileName ?? "Unnamed import"}</h2>
                  <p className="muted">{selected.accountName} · {selected.fileType} · {selected.candidates.length} candidates</p>
                </div>
                <div className="import-diagnostics-actions">
                  <Button type="button" variant="secondary" onClick={() => void navigator.clipboard?.writeText(serialiseImportDiagnosticSession(selected))}>Copy JSON</Button>
                  <Button type="button" variant="secondary" onClick={() => downloadJson(selected)}>Export JSON</Button>
                  <Button type="button" variant="ghost" onClick={() => { deleteImportDiagnosticSession(selected.id); const next = sessions.filter((entry) => entry.id !== selected.id); setSessions(next); setSelectedId(next[0]?.id ?? null); }}>Delete</Button>
                </div>
              </div>

              {selected.audit ? <details><summary>Commit audit</summary><pre>{JSON.stringify(selected.audit, null, 2)}</pre></details> : null}
              <div className="transaction-import-performance-list">
                {candidates.map((candidate) => (
                  <details key={candidate.id}>
                    <summary>Row {candidate.rowNumber}: {candidate.sourcePayee} · {candidate.outcome}</summary>
                    <div className="import-diagnostics-candidate-summary">
                      <span>Date: {candidate.sourceDate || "—"}</span>
                      <span>Amount: {candidate.amount}</span>
                      <span>Proposal: {candidate.proposal.payee || "—"}</span>
                      <span>Match: {candidate.matchedTransactionId ?? "none"}</span>
                    </div>
                    {candidate.validationErrors.length > 0 ? <pre>{JSON.stringify(candidate.validationErrors, null, 2)}</pre> : null}
                    <pre>{JSON.stringify(candidate.trace, null, 2)}</pre>
                  </details>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
