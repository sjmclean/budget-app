import { useEffect, useState } from "react";
import "../../../styles/registerUndoToast.css";
import { applicationHistory } from "../../history/applicationHistory";
import { useUIStore } from "../../../stores/uiStore";

const UNDO_TOAST_DURATION_MS = 6000;

interface RegisterUndoToastProps {
  canUndo: boolean;
  isHistoryBusy: boolean;
  onUndo: () => void;
}

interface UndoToastState {
  commandId: string;
  label: string;
}

export function RegisterUndoToast({
  canUndo,
  isHistoryBusy,
  onUndo,
}: RegisterUndoToastProps) {
  const budgetId = useUIStore((state) => state.selectedBudgetId);
  const [toast, setToast] = useState<UndoToastState | null>(null);

  useEffect(() => {
    setToast(null);
    return applicationHistory.subscribeToActions(budgetId, (result) => {
      if (!result.performed) return;

      if (result.action === "execute") {
        setToast({ commandId: result.commandId, label: result.label });
        return;
      }

      setToast(null);
    });
  }, [budgetId]);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(() => setToast(null), UNDO_TOAST_DURATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="register-undo-toast" role="status" aria-live="polite">
      <span className="register-undo-toast-message">{toast.label}</span>
      <button
        className="register-undo-toast-action"
        type="button"
        disabled={!canUndo || isHistoryBusy}
        onClick={() => {
          setToast(null);
          onUndo();
        }}
      >
        Undo
      </button>
      <button
        className="register-undo-toast-dismiss"
        type="button"
        aria-label="Dismiss undo notification"
        onClick={() => setToast(null)}
      >
        ×
      </button>
    </div>
  );
}
