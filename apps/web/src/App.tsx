import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { ThemeBootstrap } from "./app/ThemeBootstrap";
import { AppDialogsProvider } from "./features/ui/AppDialogsProvider";

export function App() {
  return (
    <ThemeBootstrap>
      <>
      <RouterProvider router={router} />
      <AppDialogsProvider />
    </>
    </ThemeBootstrap>
  );
}
