import { Clock3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildScheduledPreview,
  getScheduledPreviewRelativeLabel,
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
import { DropdownMenu } from "../../features/ui/DropdownMenu";

type ScheduledTransactionsPreviewProps = {
  budgetId: string | null;
  accountId: string;
  currencyCode: string;
  onViewAll: () => void;
  onEditSchedule: (scheduleId: string) => void;
};

export function ScheduledTransactionsPreview({
  budgetId,
  accountId,
  currencyCode,
  onViewAll,
  onEditSchedule,
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

  const today = localCalendarDate();
  const preview = useMemo(
    () => buildScheduledPreview(schedules, today, days),
    [schedules, today, days],
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
      className="register-scheduled-ghosts"
      aria-label="Upcoming scheduled transactions"
    >
      <div className="register-scheduled-ghost-controls">
        <span>Upcoming</span>
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
        <span>{preview.total} scheduled</span>
        <button type="button" onClick={onViewAll}>
          View all scheduled
        </button>
      </div>

      {preview.total ? (
        <div className="register-scheduled-ghost-list">
          {preview.items.map((item) => {
            const amount = item.inflow - item.outflow;
            const payee = item.payee || "Scheduled transaction";
            return (
              <div className="register-scheduled-ghost-row" key={item.id}>
                <span
                  className="register-scheduled-ghost-select-placeholder"
                  aria-hidden="true"
                />
                <time dateTime={item.nextDueDate}>
                  {formatDateForDisplay(item.nextDueDate, dateFormat)}
                </time>
                <span className="register-scheduled-ghost-utility" aria-hidden="true" />
                <span className="register-scheduled-ghost-utility" aria-hidden="true" />
                <div className="register-scheduled-ghost-content">
                  <strong>{payee}</strong>
                  <span>
                    {item.category ? <>{item.category} · </> : null}
                    {getScheduledPreviewRelativeLabel(item.nextDueDate, today)}
                  </span>
                </div>
                <b className={amount >= 0 ? "positive" : "negative"}>
                  {money.format(amount)}
                </b>
                <span
                  className="register-scheduled-ghost-balance-placeholder"
                  aria-hidden="true"
                />
                <DropdownMenu
                  label={<Clock3 size={15} aria-hidden="true" />}
                  ariaLabel={`Scheduled transaction actions for ${payee}`}
                  buttonClassName="register-scheduled-ghost-action"
                  className="register-scheduled-ghost-menu"
                  panelClassName="dropdown-menu-panel register-scheduled-ghost-menu-panel"
                >
                  {({ closeMenu }) => (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={busyId !== null}
                        onClick={() => {
                          void act(item, "enter").finally(() =>
                            closeMenu({ restoreFocus: true }),
                          );
                        }}
                      >
                        Enter now
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={busyId !== null}
                        onClick={() => {
                          void act(item, "skip").finally(() =>
                            closeMenu({ restoreFocus: true }),
                          );
                        }}
                      >
                        Skip this occurrence
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          closeMenu();
                          onEditSchedule(item.id);
                        }}
                      >
                        Edit schedule
                      </button>
                    </>
                  )}
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="register-scheduled-ghost-empty">
          No scheduled transactions in the next {days} days.
        </p>
      )}

      {preview.remaining ? (
        <button
          className="register-scheduled-ghost-more"
          type="button"
          onClick={onViewAll}
        >
          +{preview.remaining} more
        </button>
      ) : null}
      {error ? (
        <p className="register-scheduled-ghost-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
