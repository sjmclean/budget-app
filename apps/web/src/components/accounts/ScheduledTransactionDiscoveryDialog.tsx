import { useState } from "react";
import type { ScheduledTransactionSuggestion } from "../../features/accounts/scheduledTransactionDiscovery";
import { formatDateForDisplay } from "../../features/settings/dateFormatting";

export function ScheduledTransactionDiscoveryDialog({
  suggestions,
  dateFormat,
  isLoading,
  error,
  onCreate,
  onReview,
  onIgnore,
  onClose,
}: {
  suggestions: readonly ScheduledTransactionSuggestion[];
  dateFormat: string;
  isLoading: boolean;
  error: string | null;
  onCreate: (suggestion: ScheduledTransactionSuggestion) => void;
  onReview: (suggestion: ScheduledTransactionSuggestion) => void;
  onIgnore: (suggestion: ScheduledTransactionSuggestion) => void;
  onClose: () => void;
}) {
  const [expandedSuggestionId, setExpandedSuggestionId] = useState<string | null>(null);

  return (
    <div className="scheduled-discovery-backdrop" role="presentation">
      <section
        className="scheduled-discovery-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scheduled-discovery-title"
      >
        <header className="scheduled-discovery-header">
          <div>
            <p className="scheduled-editor-eyebrow">Recurring transaction discovery</p>
            <h3 id="scheduled-discovery-title">Find Scheduled Transactions</h3>
            <p>We analyse the last 18 months of this account and suggest recurring patterns for you to review.</p>
          </div>
          <button className="button button-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        {isLoading ? (
          <p className="scheduled-discovery-state" role="status">Looking for recurring transactions…</p>
        ) : error ? (
          <p className="scheduled-discovery-error" role="alert">{error}</p>
        ) : suggestions.length === 0 ? (
          <div className="scheduled-discovery-empty">
            <strong>No new scheduled transaction suggestions found.</strong>
            <p>We only suggest patterns with enough recent evidence and exclude transactions already covered by an existing schedule.</p>
          </div>
        ) : (
          <>
            <p className="scheduled-discovery-summary">
              {suggestions.length} possible scheduled transaction{suggestions.length === 1 ? "" : "s"} found.
            </p>
            <div className="scheduled-discovery-list">
              {suggestions.map((suggestion) => {
                const expanded = expandedSuggestionId === suggestion.id;
                return (
                  <article className="scheduled-discovery-card" key={suggestion.id}>
                    <div className="scheduled-discovery-card-heading">
                      <div>
                        <div className="scheduled-discovery-title-row">
                          <strong>{suggestion.payee}</strong>
                          <span className={`scheduled-discovery-confidence scheduled-discovery-confidence-${suggestion.confidence}`}>
                            {suggestion.confidence === "high" ? "High confidence" : "Possible"}
                          </span>
                        </div>
                        <p>
                          {suggestion.recurrenceLabel}
                          {" · "}
                          {suggestion.amount.kind === "fixed"
                            ? formatMoney(suggestion.amount.suggested)
                            : `${formatMoney(suggestion.amount.min)} – ${formatMoney(suggestion.amount.max)}`}
                        </p>
                      </div>
                      <span>{suggestion.evidence.occurrenceCount} transactions</span>
                    </div>

                    <dl className="scheduled-discovery-details">
                      <div>
                        <dt>Category</dt>
                        <dd>{suggestion.category || "Review required"}</dd>
                      </div>
                      <div>
                        <dt>Next expected</dt>
                        <dd>{formatDateForDisplay(suggestion.nextDueDate, dateFormat)}</dd>
                      </div>
                      <div>
                        <dt>Amount</dt>
                        <dd>{suggestion.amount.kind === "fixed" ? "Stable" : "Varies"}</dd>
                      </div>
                    </dl>

                    {suggestion.amount.kind === "variable" ? (
                      <p className="scheduled-discovery-note">
                        The amount varies, so review this suggestion before creating a schedule.
                      </p>
                    ) : null}

                    <button
                      className="scheduled-discovery-evidence-toggle"
                      type="button"
                      onClick={() => setExpandedSuggestionId(expanded ? null : suggestion.id)}
                    >
                      {expanded ? "Hide transactions" : "View transactions"}
                    </button>

                    {expanded ? (
                      <div className="scheduled-discovery-evidence">
                        {suggestion.evidence.dates.map((date, index) => (
                          <span key={`${suggestion.id}:${suggestion.evidence.transactionIds[index]}`}>
                            {formatDateForDisplay(date, dateFormat)}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="scheduled-discovery-actions">
                      {!suggestion.requiresReview ? (
                        <button
                          className="button button-primary"
                          type="button"
                          onClick={() => onCreate(suggestion)}
                        >
                          Create Schedule
                        </button>
                      ) : null}
                      <button
                        className={suggestion.requiresReview ? "button button-primary" : "button button-secondary"}
                        type="button"
                        onClick={() => onReview(suggestion)}
                      >
                        Review
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => onIgnore(suggestion)}
                      >
                        Ignore
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(value);
}
