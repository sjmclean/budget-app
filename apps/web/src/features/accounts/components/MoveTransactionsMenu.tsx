import type { SidebarAccount } from "../accountService";
import {
  FloatingMenu,
  FloatingMenuHeading,
  FloatingMenuList,
  type FloatingPosition,
} from "../../floatingUi";

interface MoveTransactionsMenuProps {
  isOpen: boolean;
  position: Pick<FloatingPosition, "top" | "left"> | null;
  transactionCount: number;
  transferTransactionCount: number;
  reconciledTransactionCount: number;
  accounts: SidebarAccount[];
  onMoveTransactions: (targetAccountId: string) => void;
  onClose: () => void;
}

function getMoveAccountIcon(account: SidebarAccount) {
  if (account.type === "credit-card") {
    return "💳";
  }

  if (account.type === "tracking") {
    return "📈";
  }

  return "🏦";
}

export function MoveTransactionsMenu({
  isOpen,
  position,
  transactionCount,
  transferTransactionCount,
  reconciledTransactionCount,
  accounts,
  onMoveTransactions,
  onClose,
}: MoveTransactionsMenuProps) {
  return (
    <FloatingMenu
      isOpen={isOpen}
      label="Move selected transactions to account"
      layerClassName="register-move-popover-layer floating-menu-layer"
      panelClassName="register-move-popover floating-menu-panel"
      position={position}
      onClose={onClose}
    >
      <FloatingMenuHeading
        className="register-move-popover-heading floating-menu-heading"
        title="Move to Account"
        subtitle={`${transactionCount} transaction${transactionCount === 1 ? "" : "s"}`}
      />

      {transferTransactionCount > 0 ? (
        <p className="register-move-warning">
          {transferTransactionCount} transfer transaction
          {transferTransactionCount === 1 ? " was" : "s were"} excluded. Edit or
          delete transfers instead.
        </p>
      ) : null}

      {reconciledTransactionCount > 0 ? (
        <p className="register-move-warning">
          {reconciledTransactionCount} reconciled transaction
          {reconciledTransactionCount === 1 ? " was" : "s were"} excluded.
          Reconciled history is locked.
        </p>
      ) : null}

      <FloatingMenuList className="register-move-account-list floating-menu-list">
        {accounts.map((account) => (
          <button
            key={account.id}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              onMoveTransactions(account.id);
            }}
          >
            <span className="register-move-account-icon" aria-hidden="true">
              {getMoveAccountIcon(account)}
            </span>
            <span>{account.name}</span>
          </button>
        ))}
      </FloatingMenuList>
    </FloatingMenu>
  );
}
