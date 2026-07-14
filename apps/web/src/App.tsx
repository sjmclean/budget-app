import { Suspense } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { ThemeBootstrap } from "./app/ThemeBootstrap";
import { AppDialogsProvider } from "./features/ui/AppDialogsProvider";
import { AppErrorBoundary } from "./app/errors/AppErrorBoundary";

export function App() {
  return (
    <AppErrorBoundary>
      <ThemeBootstrap>
        <>
          <Suspense
            fallback={
              <div className="route-loading-screen" role="status" aria-live="polite">
                Loading application…
              </div>
            }
          >
            <RouterProvider router={router} />
          </Suspense>
          <AppDialogsProvider />
        </>
      </ThemeBootstrap>
    </AppErrorBoundary>
  );
}
