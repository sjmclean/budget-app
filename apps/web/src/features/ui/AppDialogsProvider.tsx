import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  type AlertDialogInput,
  type AppDialogHost,
  type AppDialogRequest,
  type ConfirmDialogInput,
  installAppDialogHost,
} from "./appDialogService";

interface ActiveConfirmDialog {
  request: Extract<AppDialogRequest, { kind: "confirm" }>;
  resolve: (confirmed: boolean) => void;
}

interface ToastMessage {
  id: string;
  title?: string;
  message: string;
  tone: "default" | "danger";
}

function createDialogId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AppDialogsProvider() {
  const [activeConfirm, setActiveConfirm] = useState<ActiveConfirmDialog | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const confirmQueue = useRef<ActiveConfirmDialog[]>([]);
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const showNextConfirm = useCallback(() => {
    setActiveConfirm((current) => {
      if (current) {
        return current;
      }

      return confirmQueue.current.shift() ?? null;
    });
  }, []);

  const dismissToast = useCallback((toastId: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }, []);

  const host = useMemo<AppDialogHost>(
    () => ({
      confirm(input: ConfirmDialogInput) {
        return new Promise<boolean>((resolve) => {
          confirmQueue.current.push({
            request: {
              id: createDialogId("confirm"),
              kind: "confirm",
              ...input,
            },
            resolve,
          });
          showNextConfirm();
        });
      },
      alert(input: AlertDialogInput) {
        const toastId = createDialogId("toast");
        setToasts((current) => [
          ...current,
          {
            id: toastId,
            title: input.title,
            message: input.message,
            tone: input.tone ?? "default",
          },
        ]);

        window.setTimeout(() => {
          dismissToast(toastId);
        }, 5000);

        return Promise.resolve();
      },
    }),
    [dismissToast, showNextConfirm],
  );

  useEffect(() => installAppDialogHost(host), [host]);

  useEffect(() => {
    if (!activeConfirm) {
      return;
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const dialog = dialogRef.current;
    const focusableSelector =
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        resolveConfirm(false);
        return;
      }

      if (event.key !== "Tab" || !dialog) {
        return;
      }

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => {
      dialog?.querySelector<HTMLElement>(".button-primary, .button-danger")?.focus();
    });

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => previousFocusRef.current?.focus());
    };
  }, [activeConfirm]);

  function resolveConfirm(confirmed: boolean) {
    if (!activeConfirm) {
      return;
    }

    activeConfirm.resolve(confirmed);
    setActiveConfirm(null);
    window.setTimeout(showNextConfirm, 0);
  }

  const dialogLayer = (
    <>
      {activeConfirm ? (
        <div className="app-dialog-backdrop" role="presentation">
          <section
            ref={dialogRef}
            aria-labelledby={`${activeConfirm.request.id}-title`}
            aria-modal="true"
            className="app-dialog"
            role="dialog"
            tabIndex={-1}
          >
            <h2 className="app-dialog-title" id={`${activeConfirm.request.id}-title`}>
              {activeConfirm.request.title ?? "Please confirm"}
            </h2>
            <p className="app-dialog-message">{activeConfirm.request.message}</p>
            <div className="app-dialog-actions">
              <button className="button-secondary" type="button" onClick={() => resolveConfirm(false)}>
                {activeConfirm.request.cancelLabel ?? "Cancel"}
              </button>
              <button
                className={activeConfirm.request.tone === "danger" ? "button-danger" : "button-primary"}
                type="button"
                onClick={() => resolveConfirm(true)}
              >
                {activeConfirm.request.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {toasts.length > 0 ? (
        <div aria-live="polite" aria-relevant="additions" className="app-toast-region" role="status">
          {toasts.map((toast) => (
            <article className={`app-toast app-toast--${toast.tone}`} key={toast.id}>
              <div className="app-toast-copy">
                {toast.title ? <strong>{toast.title}</strong> : null}
                <span>{toast.message}</span>
              </div>
              <button className="app-toast-close" type="button" onClick={() => dismissToast(toast.id)}>
                Dismiss
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </>
  );

  return createPortal(dialogLayer, document.body);
}
