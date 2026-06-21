import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { bootstrapHostPersistenceGateway } from "./features/persistence";
import "./styles/globals.css";
import "./styles/register.css";

bootstrapHostPersistenceGateway();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
