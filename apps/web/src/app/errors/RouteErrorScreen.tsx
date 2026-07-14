import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { AppRecoveryScreen } from "./AppRecoveryScreen";

function normalizeRouteError(error: unknown): unknown {
  if (!isRouteErrorResponse(error)) {
    return error;
  }

  const detail =
    typeof error.data === "string"
      ? error.data
      : error.statusText || "A route failed to load.";

  return new Error(`${error.status} ${detail}`);
}

export function RouteErrorScreen() {
  const routeError = useRouteError();

  return (
    <AppRecoveryScreen
      error={normalizeRouteError(routeError)}
      source="route"
      title="This page could not be displayed"
      message="The rest of the application may still be usable. Reload this page or return to the budget selector."
    />
  );
}
