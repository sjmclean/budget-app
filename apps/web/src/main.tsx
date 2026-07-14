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
import "./styles/topBarUndoRedo.css";

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
    bootstrapHostPersistenceGateway();
    await hydrateBrowserStorageBackend();
    installBrowserStorageLifecycleFlush();

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
