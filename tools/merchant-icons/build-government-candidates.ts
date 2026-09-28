import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GOVERNMENT_SOURCE_REGISTRY, type GovernmentSourceDefinition } from "./governmentSourceRegistry.js";

interface Candidate {
  readonly key: string;
  readonly name: string;
  readonly country: GovernmentSourceDefinition["country"];
  readonly level: GovernmentSourceDefinition["level"];
  readonly aliases: readonly string[];
  readonly sourceId: string;
  readonly sourceUrl: string;
  readonly authority: string;
}

const root = process.cwd();
const snapshotDirectory = resolve(root, "tools/merchant-icons/sources/government");
const outputPath = resolve(root, "tools/merchant-icons/manifests/government-candidates.json");

function decodeHtml(value: string): string {
  return value
    .replace(/<br\s*\/?\s*>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&nbsp;/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[’']/gu, "")
    .replace(/&/gu, " and ")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-+/gu, "-");
}

function canonical(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[’']/gu, "")
    .replace(/&/gu, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/u, ""));
    rows.push(row);
  }
  return rows;
}

function makeCandidate(source: GovernmentSourceDefinition, name: string, aliases: readonly string[] = []): Candidate | undefined {
  const cleanName = decodeHtml(name);
  if (!cleanName || cleanName.length < 2 || cleanName.length > 180) return undefined;
  const cleanAliases = [...new Set(aliases.map(decodeHtml).filter((alias) => alias && canonical(alias) !== canonical(cleanName)))];
  const keySlug = slug(cleanName);
  if (!keySlug) return undefined;
  return {
    key: `gov-${keySlug}-${source.country.toLocaleLowerCase()}`,
    name: cleanName,
    country: source.country,
    level: source.level,
    aliases: cleanAliases,
    sourceId: source.id,
    sourceUrl: source.url,
    authority: source.authority,
  };
}

function parseAu(source: GovernmentSourceDefinition, text: string): Candidate[] {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new TypeError("AGOR snapshot does not contain data rows.");
  const headers = rows[0].map((value) => value.trim());
  const titleIndex = headers.findIndex((value) => canonical(value) === "title");
  if (titleIndex < 0) throw new TypeError("AGOR snapshot is missing the Title column.");
  return rows.slice(1)
    .map((row) => makeCandidate(source, row[titleIndex] ?? ""))
    .filter((candidate): candidate is Candidate => Boolean(candidate));
}

function parseGb(source: GovernmentSourceDefinition, text: string): Candidate[] {
  const payload = JSON.parse(text) as {
    readonly results?: readonly {
      readonly title?: string;
      readonly details?: {
        readonly abbreviation?: string | null;
        readonly govuk_status?: string | null;
      };
    }[];
  };
  if (!Array.isArray(payload.results)) throw new TypeError("GOV.UK snapshot is missing results.");
  return payload.results
    .filter(({ details }) => details?.govuk_status !== "closed")
    .map(({ title, details }) => makeCandidate(
      source,
      title ?? "",
      details?.abbreviation?.trim() ? [details.abbreviation.trim()] : [],
    ))
    .filter((candidate): candidate is Candidate => Boolean(candidate));
}

function parseNz(source: GovernmentSourceDefinition, text: string): Candidate[] {
  const matches = [...text.matchAll(/<a\b[^>]*href=["'][^"']*\/organisations\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/giu)];
  return matches
    .map((match) => makeCandidate(source, match[1] ?? ""))
    .filter((candidate): candidate is Candidate => Boolean(candidate));
}

function parseUs(source: GovernmentSourceDefinition, text: string): Candidate[] {
  const buttonMatches = [...text.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/giu)];
  const headingMatches = [...text.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/giu)];
  const names = [...buttonMatches, ...headingMatches].map((match) => decodeHtml(match[1] ?? ""));
  const noise = new Set(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"]);
  return names
    .filter((name) => !noise.has(name) && !/^search agencies/iu.test(name) && !/^a-z index/iu.test(name))
    .map((name) => makeCandidate(source, name))
    .filter((candidate): candidate is Candidate => Boolean(candidate));
}

const parserById: Readonly<Record<string, (source: GovernmentSourceDefinition, text: string) => Candidate[]>> = {
  "au-agor": parseAu,
  "nz-government-a-z": parseNz,
  "gb-govuk-organisations": parseGb,
  "us-usagov-agencies": parseUs,
};

const all: Candidate[] = [];
for (const source of GOVERNMENT_SOURCE_REGISTRY) {
  const parser = parserById[source.id];
  if (!parser) throw new TypeError(`No government candidate parser registered for ${source.id}.`);
  const text = await readFile(resolve(snapshotDirectory, source.snapshotFile), "utf8");
  const candidates = parser(source, text);
  console.log(`Parsed ${source.id}: ${candidates.length.toLocaleString()} candidates.`);
  all.push(...candidates);
}

const byIdentity = new Map<string, Candidate>();
const collisions: string[] = [];
for (const candidate of all) {
  const identity = `${candidate.country}:${canonical(candidate.name)}`;
  const previous = byIdentity.get(identity);
  if (!previous) {
    byIdentity.set(identity, candidate);
    continue;
  }
  const mergedAliases = [...new Set([...previous.aliases, ...candidate.aliases])];
  byIdentity.set(identity, { ...previous, aliases: mergedAliases });
  if (previous.sourceId !== candidate.sourceId) collisions.push(`${candidate.country}: ${candidate.name}`);
}

const candidates = [...byIdentity.values()].sort(
  (left, right) => left.country.localeCompare(right.country) || left.name.localeCompare(right.name),
);
const countryCounts = Object.fromEntries(
  ["AU", "NZ", "GB", "US"].map((country) => [country, candidates.filter((entry) => entry.country === country).length]),
);

await mkdir(resolve(root, "tools/merchant-icons/manifests"), { recursive: true });
await writeFile(outputPath, JSON.stringify({
  version: 1,
  purpose: "Source inventory only. Entries are not promoted to the runtime merchant catalogue until reviewed artwork is available.",
  generatedAt: new Date().toISOString(),
  sourceCount: GOVERNMENT_SOURCE_REGISTRY.length,
  candidateCount: candidates.length,
  countryCounts,
  crossSourceIdentityCollisions: collisions,
  candidates,
}, null, 2) + "\n");

console.log(`Government candidate inventory: ${candidates.length.toLocaleString()} unique organisations.`);
console.log(`By country: ${Object.entries(countryCounts).map(([country, count]) => `${country} ${count}`).join(", ")}.`);
