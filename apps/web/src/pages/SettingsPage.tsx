import { Card } from "../components/ui/Card";
import { getPersistenceModeSummary } from "../features/persistence/persistenceMode";
import { useUIStore, type ThemeMode } from "../stores/uiStore";

export function SettingsPage() {
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);
  const persistenceMode = getPersistenceModeSummary();

  return (
    <div className="page-stack">
      <section className="page-header">
        <p className="eyebrow">Settings</p>
        <h1>Preferences</h1>
        <p className="muted">
          Initial read-only settings shell for app preferences and future
          budget-level configuration.
        </p>
      </section>

      <Card className="settings-card">
        <div className="settings-row">
          <div>
            <h2>Theme</h2>
            <p className="muted">Choose how the application should appear.</p>
          </div>

          <select
            value={theme}
            onChange={(event) => setTheme(event.target.value as ThemeMode)}
            className="select"
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>


        <div className="settings-row">
          <div>
            <h2>Persistence mode</h2>
            <p className="muted">{persistenceMode.description}</p>
          </div>

          <strong>{persistenceMode.label}</strong>
        </div>

        <div className="settings-row">
          <div>
            <h2>Currency</h2>
            <p className="muted">Default currency for the current budget.</p>
          </div>

          <strong>AUD</strong>
        </div>

        <div className="settings-row">
          <div>
            <h2>Date format</h2>
            <p className="muted">Display format for dates.</p>
          </div>

          <strong>DD/MM/YYYY</strong>
        </div>
      </Card>
    </div>
  );
}
