import { readFile } from "node:fs/promises";

const required = [
  ["apps/web/src/features/persistence/replicationService.ts", "startReplicationBackgroundService"],
  ["apps/web/src/features/persistence/useReplicationStatus.ts", "useSyncExternalStore"],
  ["apps/web/src/main.tsx", "startReplicationBackgroundService"],
  ["apps/web/src/pages/SettingsPage.tsx", "Sync now"],
];
for (const [file, marker] of required) {
  const text = await readFile(file, "utf8");
  if (!text.includes(marker)) throw new Error(`${file} is missing ${marker}`);
}
console.log("Milestone 6 synchronisation service validation passed");
