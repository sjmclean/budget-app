import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { useUIStore } from "../stores/uiStore";

export function AppShell() {
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed);

  return (
    <div className="app-shell">
      <Sidebar />

      <div
        className={
          sidebarCollapsed
            ? "app-content app-content-collapsed"
            : "app-content"
        }
      >
        <TopBar />

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
