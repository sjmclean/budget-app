import type { Ynab4PackageEntry } from "./readBudget.js";

export function selectLatestCompleteDeviceGuid(
  entries: Ynab4PackageEntry[],
): string | null {
  const devices = entries.flatMap((entry) => {
    if (!entry.path.includes("/devices/")) return [];
    try {
      const metadata = JSON.parse(entry.text) as Record<string, unknown>;
      if (metadata.hasFullKnowledge !== true) return [];
      const deviceGuid = firstNonEmptyString(metadata.deviceGUID);
      const knowledge = firstNonEmptyString(metadata.knowledge);
      if (!deviceGuid || !knowledge) return [];
      return [{ deviceGuid, recentness: estimateKnowledgeRecentness(knowledge) }];
    } catch {
      return [];
    }
  });

  devices.sort((left, right) => left.recentness - right.recentness);
  return devices.at(-1)?.deviceGuid ?? null;
}

export function estimateKnowledgeRecentness(knowledge: string): number {
  return knowledge.split(",").reduce((total, version) => {
    const separator = version.lastIndexOf("-");
    const parsed = Number.parseInt(version.slice(separator + 1), 10);
    return total + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);
}

function firstNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
