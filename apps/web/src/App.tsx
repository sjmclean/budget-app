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
          <RouterProvider router={router} />
          <AppDialogsProvider />
        </>
      </ThemeBootstrap>
    </AppErrorBoundary>
  );
}
