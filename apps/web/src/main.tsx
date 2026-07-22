import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { StartupRecoveryScreen } from "./app/errors/StartupRecoveryScreen";
import {
  bootstrapHostBudgetPersistenceProvider,
  getBudgetPersistenceProvider,
} from "./features/persistence";
import { installPersistenceProviderLifecycle } from "./features/persistence/persistenceProviderLifecycle";
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
    bootstrapHostBudgetPersistenceProvider();
    const persistenceProvider = getBudgetPersistenceProvider();
    await persistenceProvider.initialize?.();
    installPersistenceProviderLifecycle(persistenceProvider);

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
