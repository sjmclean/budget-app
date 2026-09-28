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

const requested = Number(process.env.GOVERNMENT_ARTWORK_PROBE_LIMIT ?? "250");
const selected = queue.candidates.filter(({ website }) => Boolean(website)).slice(0, requested);
const discovered: unknown[] = [];

for (const candidate of selected) {
  try {
    const response = await fetch(candidate.website!, { headers, redirect: "follow" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const finalUrl = response.url || candidate.website!;
    const html = await response.text();
    const icons = iconCandidates(html, finalUrl);
    const preferred = icons
      .map((url) => ({ url, extension: extname(new URL(url).pathname).toLocaleLowerCase() }))
      .sort((left, right) => {
        const rank = (extension: string) => extension === ".svg" ? 0 : extension === ".png" ? 1 : extension === ".webp" ? 2 : extension === ".ico" ? 3 : 4;
        return rank(left.extension) - rank(right.extension);
      })[0]?.url;
    discovered.push({
      key: candidate.key,
      name: candidate.name,
      country: candidate.country,
      ...(candidate.jurisdiction ? { jurisdiction: candidate.jurisdiction } : {}),
      priorityScore: candidate.priorityScore,
      source: finalUrl,
      ...(preferred ? { assetSource: preferred } : {}),
      iconCandidates: icons,
      status: preferred ? "candidate" : "no-declared-icon",
    });
    console.log(`${preferred ? "FOUND" : "NONE "} ${candidate.country.padEnd(2)} ${candidate.name}${preferred ? ` -> ${preferred}` : ""}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    discovered.push({
      key: candidate.key,
      name: candidate.name,
      country: candidate.country,
      ...(candidate.jurisdiction ? { jurisdiction: candidate.jurisdiction } : {}),
      priorityScore: candidate.priorityScore,
      source: candidate.website,
      status: "fetch-failed",
      error: message,
    });
    console.warn(`FAIL  ${candidate.country.padEnd(2)} ${candidate.name}: ${message}`);
  }
}

await mkdir(resolve(process.cwd(), "tools/merchant-icons/manifests"), { recursive: true });
await writeFile(outputPath, JSON.stringify({
  version: 1,
  purpose: "Artwork discovery only. Assets are not reviewed or runtime-approved until manually validated.",
  requested: selected.length,
  discovered: discovered.filter((entry) => (entry as { status: string }).status === "candidate").length,
  entries: discovered,
}, null, 2) + "\n");

console.log(`Government artwork probe complete: ${selected.length} sites checked, ${discovered.filter((entry) => (entry as { status: string }).status === "candidate").length} declared icons found.`);
