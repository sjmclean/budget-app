import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { ThemeBootstrap } from "./app/ThemeBootstrap";

export function App() {
  return (
    <ThemeBootstrap>
      <RouterProvider router={router} />
    </ThemeBootstrap>
  );
}
