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
import { activateBudgetPersistence } from "./features/persistence/budgetDatabaseLifecycle";
import { loadAuthStatus } from "./features/auth/authStatusClient";
function getApplicationRoot(): HTMLElement {
  const root = document.getElementById("root");

  if (!root) {
    throw new Error("Budget App root element was not found.");
  }

  return root;
}

function markStartup(name: string): void {
  globalThis.performance?.mark?.(`budget-app:${name}`);
}

export async function bootstrapApp() {
  markStartup("startup:start");
  const root = getApplicationRoot();
  let reactRoot: ReturnType<typeof ReactDOM.createRoot> | null = null;

  try {
    let attachmentNamespace: string | undefined;
    let hostedBudgets: readonly HostedBudgetCatalogueEntry[] = [];
    let hostedCatalogueAuthoritative = false;

    // Start loading the extended merchant catalogue immediately so its async
    // chunks overlap authentication and persistence startup. We still await
    // completion before importing/rendering App, preserving exact merchant
    // matching on first paint without serialising this work behind database
    // initialization.
    markStartup("merchant-preload:start");
    const extendedMerchantCataloguePromise = import(
      "./features/icons/merchantIconCatalogue"
    ).then(({ preloadExtendedMerchantIconCatalogue }) =>
      preloadExtendedMerchantIconCatalogue(),
    ).then(() => {
      markStartup("merchant-preload:end");
    });

    const hostProvider = bootstrapHostBudgetPersistenceProvider();
    if (!hostProvider) {
      markStartup("auth:start");
      const session = await loadAuthStatus();
      markStartup("auth:end");
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
    markStartup("persistence-initialize:start");
    await persistenceProvider.initialize?.();
    markStartup("persistence-initialize:end");
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
      startImmediately: false,
    });

    const selectedBudgetId =
      persistenceProvider.keyValueStorage?.getItem(SELECTED_BUDGET_STORAGE_KEY) ?? null;
    const initialBudgetActivationPromise = selectedBudgetId
      ? activateBudgetPersistence(selectedBudgetId, {
          deferBackgroundSync: true,
        })
      : Promise.resolve();

    // Import application modules only after runtime persistence is configured.
    // Zustand stores read registry and selection state during module creation.
    // The app import and selected-budget SQLite activation can overlap because
    // both depend only on the now-configured persistence runtime.
    markStartup("app-import:start");
    const appImportPromise = import("./App").then((module) => {
      markStartup("app-import:end");
      return module;
    });

    await Promise.all([
      extendedMerchantCataloguePromise,
      initialBudgetActivationPromise,
    ]);
    const { App } = await appImportPromise;

    reactRoot = ReactDOM.createRoot(root);
    markStartup("react-render:start");
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
