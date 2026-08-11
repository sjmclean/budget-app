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
      const session = await fetch(`${apiBaseUrl}/api/auth/status`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      }).then((response) => response.ok ? response.json() : null).catch(() => null) as
        | {
            authenticated?: boolean;
            user?: { id?: string; isAdmin?: boolean };
            budgets?: HostedBudgetCatalogueEntry[];
          }
        | null;
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
