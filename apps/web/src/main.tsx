import React from "react";
import ReactDOM from "react-dom/client";
import { StartupRecoveryScreen } from "./app/errors/StartupRecoveryScreen";
import {
  bootstrapHostBudgetPersistenceProvider,
  configureBudgetPersistenceProviderFromRuntime,
  getBudgetPersistenceProvider,
} from "./features/persistence";
import { installPersistenceProviderLifecycle } from "./features/persistence/persistenceProviderLifecycle";
import { startReplicationBackgroundService } from "./features/persistence/replicationService";
import { configureAttachmentContentStoreNamespace } from "./features/attachments/attachmentContentStore";
import {
  mergeHostedBudgetCatalogue,
  type HostedBudgetCatalogueEntry,
} from "./features/budget/budgetRegistry";
import "./styles/globals.css";
import "./styles/workspaceThemeTokens.css";
import { startRestorePointLifecycle } from "./features/budget/restorePointLifecycle";
import { SELECTED_BUDGET_STORAGE_KEY } from "./features/budget/budgetDataScope";
import { getLocalFirstDatabaseTabOwnershipBudgetId } from "./features/persistence/localFirst/databaseTabCoordinator";
import { loadAuthStatus } from "./features/auth/authStatusClient";
function getApplicationRoot(): HTMLElement {
  const root = document.getElementById("root");

  if (!root) {
    throw new Error("Budget App root element was not found.");
  }

  return root;
}

export async function bootstrapApp() {
  const root = getApplicationRoot();
  let reactRoot: ReturnType<typeof ReactDOM.createRoot> | null = null;

  try {
    let attachmentNamespace: string | undefined;
    let hostedBudgets: readonly HostedBudgetCatalogueEntry[] = [];
    let hostedCatalogueAuthoritative = false;
    const hostProvider = bootstrapHostBudgetPersistenceProvider();
    if (!hostProvider) {
      const apiBaseUrl = (
        import.meta as ImportMeta & { env?: { VITE_BUDGET_API_URL?: string } }
      ).env?.VITE_BUDGET_API_URL?.replace(/\/+$/, "") ?? "";
      const session = await loadAuthStatus().catch(() => null);
      hostedBudgets = session?.budgets ?? [];
      hostedCatalogueAuthoritative = session?.authenticated === true;
      // Preserve the original IndexedDB for the first administrator so an
      // existing installation upgrades without losing its local registry.
      const userNamespace =
        session?.authenticated && session.user?.id && !session.user.isAdmin
          ? `user-${session.user.id}`
          : session?.authenticated
            ? undefined
            : "signed-out";
      attachmentNamespace = userNamespace;
      configureBudgetPersistenceProviderFromRuntime(userNamespace);
    }

    configureAttachmentContentStoreNamespace(attachmentNamespace);
    const persistenceProvider = getBudgetPersistenceProvider();
    await persistenceProvider.initialize?.();
    if (persistenceProvider.keyValueStorage && hostedCatalogueAuthoritative) {
      mergeHostedBudgetCatalogue(
        persistenceProvider.keyValueStorage,
        hostedBudgets,
      );
      await persistenceProvider.flush?.();
    }
    installPersistenceProviderLifecycle(persistenceProvider);
    if (persistenceProvider.accountRegisterQueries?.createRestorePoint) {
      const queries = persistenceProvider.accountRegisterQueries;
      startRestorePointLifecycle({
        activeBudgetId: () => {
          if (queries.isLocalDatabaseReleased?.()) return null;
          if (persistenceProvider.syncArchitecture === "local-first-relay") {
            return getLocalFirstDatabaseTabOwnershipBudgetId();
          }
          return persistenceProvider.keyValueStorage?.getItem(SELECTED_BUDGET_STORAGE_KEY) ?? null;
        },
        capture: (budgetId) => queries.createRestorePoint!(budgetId, "timed"),
        onError: (error) => console.error("Automatic restore point could not be completed.", error),
      });
    }
    startReplicationBackgroundService(persistenceProvider, {
      apiBaseUrl: (import.meta as ImportMeta & { env?: { VITE_BUDGET_API_URL?: string } }).env?.VITE_BUDGET_API_URL,
    });

    // Import application modules only after runtime persistence is configured.
    // Zustand stores read registry and selection state during module creation.
    const { App } = await import("./App");

    reactRoot = ReactDOM.createRoot(root);
    reactRoot.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  } catch (error) {
    console.error("Budget App startup failed.", error);
    reactRoot = reactRoot ?? ReactDOM.createRoot(root);
    reactRoot.render(<StartupRecoveryScreen error={error} />);
  }
}

void bootstrapApp();
