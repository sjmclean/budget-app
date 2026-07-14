import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { StartupRecoveryScreen } from "./app/errors/StartupRecoveryScreen";
import { bootstrapHostPersistenceGateway } from "./features/persistence";
import {
  hydrateBrowserStorageBackend,
  installBrowserStorageLifecycleFlush,
} from "./features/persistence/keyValueStoragePort";
import "./styles/globals.css";
import "./styles/register.css";
import "./styles/budgetCoverOverspending.css";
import "./styles/topBarUndoRedo.css";
import "./styles/budgetImportUx.css";

function getApplicationRoot(): HTMLElement {
  const root = document.getElementById("root");

  if (!root) {
    throw new Error("Budget App root element was not found.");
  }

  return root;
}

export async function bootstrapApp() {
  const root = getApplicationRoot();
  const reactRoot = ReactDOM.createRoot(root);

  try {
    bootstrapHostPersistenceGateway();
    await hydrateBrowserStorageBackend();
    installBrowserStorageLifecycleFlush();

    reactRoot.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  } catch (error) {
    console.error("Budget App startup failed.", error);
    reactRoot.render(<StartupRecoveryScreen error={error} />);
  }
}

void bootstrapApp();
