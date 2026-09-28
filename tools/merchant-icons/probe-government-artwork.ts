import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

interface QueueCandidate {
  readonly key: string;
  readonly name: string;
  readonly country: string;
  readonly jurisdiction?: string;
  readonly website?: string;
  readonly priorityScore: number;
}

interface QueueManifest {
  readonly candidates: readonly QueueCandidate[];
}

interface ArtworkResult {
  readonly key: string;
  readonly name: string;
  readonly country: string;
  readonly jurisdiction?: string;
  readonly priorityScore: number;
  readonly source?: string;
  readonly assetSource?: string;
  readonly iconCandidates?: readonly string[];
  readonly status:
    | "candidate-agency-specific"
    | "candidate-shared-government"
    | "rejected-third-party"
    | "no-declared-icon"
    | "fetch-failed";
  readonly sharedArtworkCount?: number;
  readonly error?: string;
}

const queuePath = resolve(process.cwd(), "tools/merchant-icons/manifests/government-promotion-queue.json");
const outputPath = resolve(process.cwd(), "tools/merchant-icons/manifests/government-artwork-candidates.json");
const queue = JSON.parse(await readFile(queuePath, "utf8")) as QueueManifest;

const headers = {
  "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36",
  "accept": "text/html,application/xhtml+xml,*/*;q=0.8",
  "accept-language": "en-AU,en;q=0.9",
} as const;

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&nbsp;/giu, " ")
    .trim();
}

function iconCandidates(html: string, pageUrl: string): string[] {
  const results: string[] = [];
  for (const match of html.matchAll(/<link\b([^>]+)>/giu)) {
    const attrs = match[1] ?? "";
    const rel = attrs.match(/\brel=["']([^"']+)["']/iu)?.[1]?.toLocaleLowerCase() ?? "";
    if (!/(?:^|\s)(?:icon|shortcut icon|apple-touch-icon|mask-icon)(?:\s|$)/u.test(rel)) continue;
    const href = attrs.match(/\bhref=["']([^"']+)["']/iu)?.[1];
    if (!href) continue;
    try {
      const url = new URL(decodeHtml(href), pageUrl).toString();
      if (!results.includes(url)) results.push(url);
    } catch {
      // Ignore malformed document URLs.
    }
  }
  return results;
}

function preferredIcon(icons: readonly string[]): string | undefined {
  return icons
    .map((url) => ({ url, extension: extname(new URL(url).pathname).toLocaleLowerCase() }))
    .sort((left, right) => {
      const rank = (extension: string) =>
        extension === ".svg" ? 0
          : extension === ".png" ? 1
          : extension === ".webp" ? 2
          : extension === ".ico" ? 3
          : 4;
      return rank(left.extension) - rank(right.extension);
    })[0]?.url;
}

function isObviousThirdPartyArtwork(assetSource: string): boolean {
  try {
    const url = new URL(assetSource);
    return /(^|\.)google\.com$/iu.test(url.hostname)
      && /\/images\/branding\/product\/ico\/web_maps_icon_/iu.test(url.pathname);
  } catch {
    return true;
  }
}

const requested = Number(process.env.GOVERNMENT_ARTWORK_PROBE_LIMIT ?? "250");
const selected = queue.candidates.filter(({ website }) => Boolean(website)).slice(0, requested);
const rawResults: ArtworkResult[] = [];

for (const candidate of selected) {
  try {
    const response = await fetch(candidate.website!, { headers, redirect: "follow" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const finalUrl = response.url || candidate.website!;
    const html = await response.text();
    const icons = iconCandidates(html, finalUrl);
    const preferred = preferredIcon(icons);
    const rejected = preferred ? isObviousThirdPartyArtwork(preferred) : false;

    rawResults.push({
      key: candidate.key,
      name: candidate.name,
      country: candidate.country,
      ...(candidate.jurisdiction ? { jurisdiction: candidate.jurisdiction } : {}),
      priorityScore: candidate.priorityScore,
      source: finalUrl,
      ...(preferred ? { assetSource: preferred } : {}),
      iconCandidates: icons,
      status: rejected ? "rejected-third-party" : preferred ? "candidate-agency-specific" : "no-declared-icon",
    });

    const label = rejected ? "REJECT" : preferred ? "FOUND " : "NONE  ";
    console.log(`${label} ${candidate.country.padEnd(2)} ${candidate.name}${preferred ? ` -> ${preferred}` : ""}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    rawResults.push({
      key: candidate.key,
      name: candidate.name,
      country: candidate.country,
      ...(candidate.jurisdiction ? { jurisdiction: candidate.jurisdiction } : {}),
      priorityScore: candidate.priorityScore,
      source: candidate.website,
      status: "fetch-failed",
      error: message,
    });
    console.warn(`FAIL   ${candidate.country.padEnd(2)} ${candidate.name}: ${message}`);
  }
}

const artworkUsage = new Map<string, number>();
for (const result of rawResults) {
  if (!result.assetSource || result.status === "rejected-third-party") continue;
  artworkUsage.set(result.assetSource, (artworkUsage.get(result.assetSource) ?? 0) + 1);
}

const entries: ArtworkResult[] = rawResults.map((result) => {
  if (!result.assetSource || result.status !== "candidate-agency-specific") return result;
  const sharedArtworkCount = artworkUsage.get(result.assetSource) ?? 1;
  if (sharedArtworkCount < 2) return { ...result, sharedArtworkCount };
  return { ...result, status: "candidate-shared-government", sharedArtworkCount };
});

const count = (status: ArtworkResult["status"]): number => entries.filter((entry) => entry.status === status).length;
const agencySpecificCount = count("candidate-agency-specific");
const sharedGovernmentCount = count("candidate-shared-government");
const rejectedThirdPartyCount = count("rejected-third-party");
const noDeclaredIconCount = count("no-declared-icon");
const fetchFailedCount = count("fetch-failed");
const declaredIconCount = agencySpecificCount + sharedGovernmentCount;

await mkdir(resolve(process.cwd(), "tools/merchant-icons/manifests"), { recursive: true });
await writeFile(outputPath, JSON.stringify({
  version: 2,
  purpose: "Artwork discovery only. Assets are not reviewed or runtime-approved until manually validated.",
  requested: selected.length,
  declaredIconCount,
  agencySpecificCount,
  sharedGovernmentCount,
  rejectedThirdPartyCount,
  noDeclaredIconCount,
  fetchFailedCount,
  entries,
}, null, 2) + "\n");

console.log(
  `Government artwork probe complete: ${selected.length} sites checked; ` +
  `${agencySpecificCount} agency-specific, ${sharedGovernmentCount} shared-government, ` +
  `${rejectedThirdPartyCount} rejected third-party, ${noDeclaredIconCount} no declared icon, ` +
  `${fetchFailedCount} fetch failed.`,
);

const shared = [...artworkUsage.entries()]
  .filter(([, usage]) => usage >= 3)
  .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
if (shared.length) {
  console.log("Repeated shared artwork:");
  for (const [assetSource, usage] of shared.slice(0, 20)) {
    console.log(`${String(usage).padStart(3)}  ${assetSource}`);
  }
}
