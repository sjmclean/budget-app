import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { bootstrapHostPersistenceGateway } from "./features/persistence";
import { hydrateBrowserStorageBackend } from "./features/persistence/keyValueStoragePort";
import "./styles/globals.css";
import "./styles/register.css";
import "./styles/budgetCoverOverspending.css";
import "./styles/topBarUndoRedo.css";
import "./styles/budgetImportUx.css";

async function bootstrapApp() {
  bootstrapHostPersistenceGateway();
  await hydrateBrowserStorageBackend();

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrapApp();
