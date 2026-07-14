import { AppRecoveryScreen } from "./AppRecoveryScreen";

export function StartupRecoveryScreen({ error }: { error: unknown }) {
  return (
    <AppRecoveryScreen
      error={error}
      source="startup"
      title="Budget App could not start"
      message="The application could not initialise its storage or startup services. Your existing data has not been intentionally changed."
    />
  );
}
