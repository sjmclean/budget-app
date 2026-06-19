import { useUIStore, type ThemeMode } from "../stores/uiStore";

export function TopBar() {
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-sm">
      <div>
        <h1 className="text-sm font-medium text-slate-500">
          Local-first budgeting
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-600" htmlFor="theme-select">
          Theme
        </label>

        <select
          id="theme-select"
          value={theme}
          onChange={(event) => setTheme(event.target.value as ThemeMode)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
    </header>
  );
}