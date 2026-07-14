import { useMemo } from "react";
import {
  buildAppErrorDiagnostics,
  downloadAppErrorDiagnostics,
  type AppErrorSource,
} from "./appErrorDiagnostics";

interface AppRecoveryScreenProps {
  error: unknown;
  source: AppErrorSource;
  title?: string;
  message?: string;
  componentStack?: string | null;
}

export function AppRecoveryScreen({
  error,
  source,
  title = "Budget App encountered an error",
  message = "Your stored budget data has not been intentionally changed. Reload the application or return to the budget selector.",
  componentStack,
}: AppRecoveryScreenProps) {
  const diagnostics = useMemo(
    () => buildAppErrorDiagnostics(error, source, componentStack),
    [componentStack, error, source],
  );

  return (
    <main className="app-recovery-screen" role="alert">
      <section className="app-recovery-card">
        <div className="app-recovery-eyebrow">Application recovery</div>
        <h1>{title}</h1>
        <p>{message}</p>

        <div className="app-recovery-error-summary">
          <strong>{diagnostics.errorName}</strong>
          <span>{diagnostics.errorMessage}</span>
        </div>

        <div className="app-recovery-actions">
          <button
            className="button button-primary"
            type="button"
            onClick={() => window.location.reload()}
          >
            Reload application
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => window.location.assign("/")}
          >
            Return to budget selector
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => downloadAppErrorDiagnostics(diagnostics)}
          >
            Export diagnostics
          </button>
        </div>

        <details className="app-recovery-details">
          <summary>Technical details</summary>
          <pre>{diagnostics.stack ?? diagnostics.errorMessage}</pre>
        </details>
      </section>
    </main>
  );
}
