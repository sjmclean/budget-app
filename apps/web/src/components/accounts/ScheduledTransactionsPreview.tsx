import { CalendarClock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildScheduledPreview,
  readScheduledPreviewDays,
  SCHEDULED_PREVIEW_DAY_OPTIONS,
  writeScheduledPreviewDays,
  type ScheduledPreviewDays,
} from "../../features/accounts/scheduledTransactionPreview";
import type { ScheduledTransactionView } from "../../features/accounts/scheduledTransactionTypes";
import { useScheduledTransactionHistory } from "../../features/accounts/useScheduledTransactionHistory";
import { createFixedBudgetScopedStorage } from "../../features/budget/budgetDataScope";
import { localCalendarDate } from "../../features/dates/localCalendarDate";
import { getBudgetPersistenceProvider } from "../../features/persistence";
import { getActiveKeyValueStorage } from "../../features/persistence/activeKeyValueStorage";
import { usePersistenceChangeVersion } from "../../features/persistence/persistenceChangeBus";
import { formatDateForDisplay } from "../../features/settings/dateFormatting";
import { useDateFormatPreference } from "../../features/settings/useDateFormatPreference";
import { confirmDialog } from "../../features/ui/appDialogService";

type ScheduledTransactionsPreviewProps = {
  budgetId: string | null;
  accountId: string;
  currencyCode: string;
  onViewAll: () => void;
};

export function ScheduledTransactionsPreview({
  budgetId,
  accountId,
  currencyCode,
  onViewAll,
}: ScheduledTransactionsPreviewProps) {
  const persistence = getBudgetPersistenceProvider().scheduledTransactions;
  const version = usePersistenceChangeVersion();
  const dateFormat = useDateFormatPreference();
  const storage = useMemo(
    () =>
      budgetId
        ? createFixedBudgetScopedStorage(getActiveKeyValueStorage(), budgetId)
        : null,
    [budgetId],
  );
  const [days, setDays] = useState<ScheduledPreviewDays>(() =>
    storage ? readScheduledPreviewDays(storage) : 7,
  );
  const [schedules, setSchedules] = useState<ScheduledTransactionView[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { enterSchedule, skipSchedule } = useScheduledTransactionHistory(
    budgetId,
    accountId,
  );

  useEffect(() => {
    setDays(storage ? readScheduledPreviewDays(storage) : 7);
  }, [storage]);

  useEffect(() => {
    let live = true;
    void persistence.listByAccount(accountId).then((items) => {
      if (live) setSchedules(items);
    });
    return () => {
      live = false;
    };
  }, [accountId, persistence, version]);

  const preview = useMemo(
    () => buildScheduledPreview(schedules, localCalendarDate(), days),
    [schedules, days],
  );

  if (!preview.scheduledTotal) return null;

  const money = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currencyCode,
  });

  const act = async (
    item: ScheduledTransactionView,
    action: "enter" | "skip",
  ) => {
    if (busyId) return;
    setBusyId(item.id);
    setError(null);
    try {
      if (action === "skip") {
        const confirmed = await confirmDialog({
          message: `Skip "${item.payee}" due ${formatDateForDisplay(item.nextDueDate, dateFormat)}?\n\nThis occurrence will not be added to the register.\nThe schedule will move to its next occurrence.`,
          confirmLabel: "Skip occurrence",
        });
        if (!confirmed) return;
      }
      await (action === "enter" ? enterSchedule(item) : skipSchedule(item));
      setSchedules(await persistence.listByAccount(accountId));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Scheduled transaction action failed.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      className="register-scheduled-preview"
      aria-labelledby="scheduled-preview-title"
    >
      <header>
        <div>
          <CalendarClock size={16} aria-hidden="true" />
          <strong id="scheduled-preview-title">Upcoming</strong>
          <span>· next</span>
          <select
            aria-label="Upcoming scheduled transaction horizon"
            value={days}
            onChange={(event) => {
              const next = Number(event.target.value) as ScheduledPreviewDays;
              setDays(next);
              if (storage) writeScheduledPreviewDays(storage, next);
            }}
          >
            {SCHEDULED_PREVIEW_DAY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} days
              </option>
            ))}
          </select>
        </div>
        <div>
          <span>{preview.total} scheduled</span>
          <button type="button" onClick={onViewAll}>
            View all scheduled
          </button>
        </div>
      </header>

      {preview.total ? (
        <div className="register-scheduled-preview-rows">
          {preview.items.map((item) => {
            const amount = item.inflow - item.outflow;
            return (
              <div className="register-scheduled-preview-row" key={item.id}>
                <span
                  className="register-scheduled-preview-marker"
                  aria-hidden="true"
                />
                <time dateTime={item.nextDueDate}>
                  {formatDateForDisplay(item.nextDueDate, dateFormat)}
                </time>
                <span
                  className="register-scheduled-preview-utility"
                  aria-hidden="true"
                />
                <span
                  className="register-scheduled-preview-utility"
                  aria-hidden="true"
                />
                <div className="register-scheduled-preview-content">
                  <strong>{item.payee || "Scheduled transaction"}</strong>
                  {item.category ? <span>{item.category}</span> : null}
                </div>
                <b className={amount >= 0 ? "positive" : "negative"}>
                  {money.format(amount)}
                </b>
                <div className="register-scheduled-preview-actions">
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void act(item, "enter")}
                  >
                    Enter now
                  </button>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void act(item, "skip")}
                  >
                    Skip
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="register-scheduled-preview-empty">
          No scheduled transactions in the next {days} days.
        </p>
      )}

      {preview.remaining ? (
        <button
          className="register-scheduled-preview-more"
          type="button"
          onClick={onViewAll}
        >
          +{preview.remaining} more
        </button>
      ) : null}
      {error ? (
        <p className="register-scheduled-preview-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
