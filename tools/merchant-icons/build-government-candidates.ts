import { execFileSync } from "node:child_process";
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
  readonly jurisdiction?: string;
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

function makeCandidate(
  source: GovernmentSourceDefinition,
  name: string,
  aliases: readonly string[] = [],
  jurisdiction?: string,
): Candidate | undefined {
  const cleanName = decodeHtml(name);
  if (!cleanName || cleanName.length < 2 || cleanName.length > 180) return undefined;
  const cleanAliases = [...new Set(aliases.map(decodeHtml).filter((alias) => alias && canonical(alias) !== canonical(cleanName)))];
  const keySlug = slug(cleanName);
  if (!keySlug) return undefined;
  const cleanJurisdiction = jurisdiction?.trim() || undefined;
  return {
    key: `gov-${keySlug}${cleanJurisdiction ? `-${slug(cleanJurisdiction)}` : ""}-${source.country.toLocaleLowerCase()}`,
    name: cleanName,
    country: source.country,
    level: source.level,
    aliases: cleanAliases,
    sourceId: source.id,
    sourceUrl: source.url,
    authority: source.authority,
    ...(cleanJurisdiction ? { jurisdiction: cleanJurisdiction } : {}),
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
  const noise = new Set(["skip to main content", "home", "contact", "about"]);
  return matches
    .map((match) => decodeHtml(match[1] ?? ""))
    .filter((name) => name && !noise.has(canonical(name)))
    .map((name) => makeCandidate(source, name))
    .filter((candidate): candidate is Candidate => Boolean(candidate));
}

function parseUs(source: GovernmentSourceDefinition, text: string): Candidate[] {
  const headings = [...text.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/giu)]
    .map((match) => decodeHtml(match[1] ?? ""));
  const noise = new Set([
    "about us", "close", "contact us", "help", "menu", "search", "search agencies",
    "a-z index", "for federal agencies", "for the public", "government benefits",
  ]);
  return headings
    .filter((name) => {
      const identity = canonical(name);
      return identity && !noise.has(identity) && !/^[a-z]$/u.test(identity);
    })
    .map((name) => {
      const abbreviation = name.match(/\(([A-Z][A-Z0-9&.-]{1,12})\)\s*$/u)?.[1];
      const displayName = abbreviation ? name.replace(/\s*\([A-Z][A-Z0-9&.-]{1,12}\)\s*$/u, "") : name;
      return makeCandidate(source, displayName, abbreviation ? [abbreviation] : []);
    })
    .filter((candidate): candidate is Candidate => Boolean(candidate));
}

function parseAuLocal(source: GovernmentSourceDefinition, text: string): Candidate[] {
  const payload = JSON.parse(text) as {
    readonly features?: readonly { readonly attributes?: { readonly lga_name?: string; readonly state?: string } }[];
  };
  if (!Array.isArray(payload.features)) throw new TypeError("Australian LGA snapshot is missing features.");
  return payload.features
    .map(({ attributes }) => makeCandidate(source, attributes?.lga_name ?? "", [], attributes?.state))
    .filter((candidate): candidate is Candidate => Boolean(candidate));
}

function parseGbLocal(source: GovernmentSourceDefinition, text: string): Candidate[] {
  const payload = JSON.parse(text) as {
    readonly entities?: readonly { readonly name?: string; readonly entity?: number | string }[];
  };
  if (!Array.isArray(payload.entities)) throw new TypeError("UK local-authority snapshot is missing entities.");
  return payload.entities
    .map(({ name }) => makeCandidate(source, name ?? ""))
    .filter((candidate): candidate is Candidate => Boolean(candidate));
}

function parseUsGovernmentUnits(source: GovernmentSourceDefinition, archivePath: string): Candidate[] {
  let members = "";
  try {
    members = execFileSync("unzip", ["-Z1", archivePath], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  } catch {
    throw new Error("The US Census government-units source requires the 'unzip' command to build candidates.");
  }
  const member = members.split(/\r?\n/u).find((name) => /\.(csv|txt)$/iu.test(name));
  if (!member) throw new TypeError("US Census government-units archive does not contain a CSV/TXT data file.");
  const text = execFileSync("unzip", ["-p", archivePath, member], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  const rows = parseCsv(text);
  if (rows.length < 2) throw new TypeError("US Census government-units file does not contain data rows.");
  const headers = rows[0].map((value) => canonical(value));
  const nameIndex = headers.findIndex((value) => ["name", "government name", "govt name", "gov name"].includes(value));
  const stateIndex = headers.findIndex((value) => ["state", "state code", "state fips", "state fips code"].includes(value));
  if (nameIndex < 0) {
    throw new TypeError(`US Census government-units file has no recognised name column. Headers: ${rows[0].join(", ")}`);
  }
  return rows.slice(1)
    .map((row) => makeCandidate(source, row[nameIndex] ?? "", [], stateIndex >= 0 ? row[stateIndex] : undefined))
    .filter((candidate): candidate is Candidate => Boolean(candidate));
}

const parserById: Readonly<Record<string, (source: GovernmentSourceDefinition, text: string) => Candidate[]>> = {
  "au-agor": parseAu,
  "nz-government-a-z": parseNz,
  "gb-govuk-organisations": parseGb,
  "us-usagov-agencies": parseUs,
  "au-local-government-areas": parseAuLocal,
  "gb-local-authorities": parseGbLocal,
};

const all: Candidate[] = [];
for (const source of GOVERNMENT_SOURCE_REGISTRY) {
  const snapshotPath = resolve(snapshotDirectory, source.snapshotFile);
  const parser = parserById[source.id];
  if (source.kind !== "zip-csv" && !parser) {
    throw new TypeError(`No government candidate parser registered for ${source.id}.`);
  }
  const candidates = source.kind === "zip-csv"
    ? parseUsGovernmentUnits(source, snapshotPath)
    : parser!(source, await readFile(snapshotPath, "utf8"));
  console.log(`Parsed ${source.id}: ${candidates.length.toLocaleString()} candidates.`);
  all.push(...candidates);
}

const byIdentity = new Map<string, Candidate>();
const collisions: string[] = [];
for (const candidate of all) {
  const identity = `${candidate.country}:${candidate.jurisdiction ?? ""}:${canonical(candidate.name)}`;
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
