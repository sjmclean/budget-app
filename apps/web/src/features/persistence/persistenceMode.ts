export type PersistenceMode = "browser-local-storage" | "database-adapter-pending";

export interface PersistenceModeSummary {
  mode: PersistenceMode;
  label: string;
  description: string;
  risk: "prototype" | "production-ready";
}

/**
 * Current web persistence status.
 *
 * The package/backend layer contains SQLite repositories and application services,
 * but the React web app still writes budget data through browser localStorage
 * feature services. Keep this centralised so UI and future tests can expose the
 * distinction clearly while the DB-backed adapter is introduced incrementally.
 */
export function getPersistenceModeSummary(): PersistenceModeSummary {
  return {
    mode: "browser-local-storage",
    label: "Browser localStorage",
    description:
      "This web build is still using browser localStorage for active budget data. SQLite-backed repositories exist in the package layer but are not wired into the web UI yet.",
    risk: "prototype",
  };
}
