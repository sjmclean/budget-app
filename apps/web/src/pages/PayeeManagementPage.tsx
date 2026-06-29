import { useEffect, useMemo, useState } from "react";
import { Card } from "../components/ui/Card";
import { getAppPersistenceGateway } from "../features/persistence";
import type { PayeeView } from "../features/accounts/payeeService";

function formatDate(value: string): string {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function PayeeManagementPage() {
  const payeesPersistence = getAppPersistenceGateway().payees;
  const [payees, setPayees] = useState<PayeeView[]>([]);
  const [search, setSearch] = useState("");
  const [selectedPayeeId, setSelectedPayeeId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    payeesPersistence.listPayees().then((loadedPayees) => {
      if (!active) {
        return;
      }

      setPayees(loadedPayees);
      setSelectedPayeeId((currentPayeeId) =>
        currentPayeeId ?? loadedPayees[0]?.id ?? null,
      );
    });

    return () => {
      active = false;
    };
  }, [payeesPersistence]);

  const filteredPayees = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();

    if (!query) {
      return payees;
    }

    return payees.filter((payee) =>
      payee.name.toLocaleLowerCase().includes(query),
    );
  }, [payees, search]);

  const selectedPayee =
    payees.find((payee) => payee.id === selectedPayeeId) ??
    filteredPayees[0] ??
    null;

  return (
    <div className="page-stack payee-management-page">
      <div className="workspace-header">
        <div>
          <h1>Payee Management</h1>
          <p className="muted">
            Clean up payees created by manual entry and imports. Rename, archive,
            merge, and import rules will be added here incrementally.
          </p>
        </div>
      </div>

      <Card className="payee-management-workspace">
        <aside className="payee-management-list-panel">
          <label className="field-label" htmlFor="payee-management-search">
            Search payees
          </label>
          <input
            id="payee-management-search"
            className="payee-management-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search payees..."
          />

          <div className="payee-management-list" role="listbox">
            {filteredPayees.length > 0 ? (
              filteredPayees.map((payee) => (
                <button
                  key={payee.id}
                  className={[
                    "payee-management-list-item",
                    selectedPayee?.id === payee.id
                      ? "payee-management-list-item-selected"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  type="button"
                  role="option"
                  aria-selected={selectedPayee?.id === payee.id}
                  onClick={() => setSelectedPayeeId(payee.id)}
                >
                  <strong>{payee.name}</strong>
                  <span>{payee.useCount} transactions</span>
                </button>
              ))
            ) : (
              <p className="payee-management-empty">No payees found.</p>
            )}
          </div>
        </aside>

        <section className="payee-management-detail-panel">
          {selectedPayee ? (
            <>
              <div className="payee-management-detail-header">
                <div>
                  <h2>{selectedPayee.name}</h2>
                  <p className="muted">
                    Payee editing, import rules, and merge actions will live here.
                  </p>
                </div>
              </div>

              <div className="payee-management-stats">
                <div>
                  <span>Transactions</span>
                  <strong>{selectedPayee.useCount}</strong>
                </div>
                <div>
                  <span>First used</span>
                  <strong>{formatDate(selectedPayee.createdAt)}</strong>
                </div>
                <div>
                  <span>Last used</span>
                  <strong>{formatDate(selectedPayee.lastUsedAt)}</strong>
                </div>
              </div>

              <div className="payee-management-placeholder-panel">
                <h3>Next steps</h3>
                <p className="muted">
                  This workspace establishes the Settings menu entry and payee
                  management layout. The next patches will add rename, default
                  category, notes, import rules, archive, and merge workflows.
                </p>
              </div>
            </>
          ) : (
            <div className="payee-management-empty-detail">
              <h2>No payee selected</h2>
              <p className="muted">Select a payee to view details.</p>
            </div>
          )}
        </section>
      </Card>
    </div>
  );
}
