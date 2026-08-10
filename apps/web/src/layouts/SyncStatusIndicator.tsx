import {
  CheckCircle2,
  Cloud,
  CloudOff,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import {
  getReplicationBackgroundService,
  useReplicationStatus,
} from "../features/persistence";

export function SyncStatusIndicator() {
  const status = useReplicationStatus();
  const visual = syncVisual(status.status);
  const title = [
    visual.label,
    status.lastSuccessfulSyncAt
      ? `Last synced ${new Date(status.lastSuccessfulSyncAt).toLocaleString()}`
      : null,
    status.lastError,
  ].filter(Boolean).join(". ");
  const Icon = visual.icon;

  return (
    <button
      className={`global-sync-indicator global-sync-indicator-${visual.tone}`}
      type="button"
      title={`${title}. Activate to sync now.`}
      aria-label={`${title}. Sync now.`}
      aria-live="polite"
      onClick={() => {
        void getReplicationBackgroundService()?.syncNow();
      }}
    >
      <Icon
        className={visual.spinning ? "global-sync-indicator-spinner" : undefined}
        size={17}
        strokeWidth={2.4}
        aria-hidden="true"
      />
      <span>{visual.label}</span>
    </button>
  );
}

function syncVisual(status: string): {
  label: string;
  tone: "active" | "success" | "warning" | "error" | "muted";
  icon: typeof Cloud;
  spinning?: boolean;
} {
  switch (status) {
    case "connecting":
      return { label: "Connecting", tone: "active", icon: LoaderCircle, spinning: true };
    case "synchronising":
      return { label: "Syncing", tone: "active", icon: LoaderCircle, spinning: true };
    case "retrying":
      return { label: "Retrying", tone: "warning", icon: LoaderCircle, spinning: true };
    case "up-to-date":
      return { label: "Up to date", tone: "success", icon: CheckCircle2 };
    case "offline":
      return { label: "Offline", tone: "warning", icon: CloudOff };
    case "conflict":
      return { label: "Conflict", tone: "error", icon: TriangleAlert };
    case "error":
      return { label: "Sync error", tone: "error", icon: TriangleAlert };
    default:
      return { label: "Sync unavailable", tone: "muted", icon: CloudOff };
  }
}
