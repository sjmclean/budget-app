import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  const buttons = [...text.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/giu)]
    .map((match) => decodeHtml(match[1] ?? ""));
  const headings = [...text.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/giu)]
    .map((match) => decodeHtml(match[1] ?? ""));
  const noise = new Set([
    "about us", "close", "contact us", "help", "menu", "search", "search agencies",
    "a-z index", "for federal agencies", "for the public", "government benefits",
  ]);
  const unique = new Map<string, string>();
  for (const name of [...buttons, ...headings]) {
    const identity = canonical(name);
    if (!identity || noise.has(identity) || /^[a-z]$/u.test(identity) || name.length > 180) continue;
    if (!unique.has(identity)) unique.set(identity, name);
  }
  return [...unique.values()]
    .map((name) => {
      const abbreviation = name.match(/\(([A-Z][A-Z0-9&.-]{1,12})\)\s*$/u)?.[1];
      const displayName = abbreviation ? name.replace(/\s*\([A-Z][A-Z0-9&.-]{1,12}\)\s*$/u, "") : name;
      return makeCandidate(source, displayName, abbreviation ? [abbreviation] : []);
    })
    .filter((candidate): candidate is Candidate => Boolean(candidate));
}

function parseAuStateDirectory(source: GovernmentSourceDefinition, text: string): Candidate[] {
  const jurisdiction = source.jurisdiction;
  if (!jurisdiction) throw new TypeError(`Australian state directory ${source.id} is missing its jurisdiction.`);

  const headingNames = [...text.matchAll(/<h[234]\b[^>]*>([\s\S]*?)<\/h[234]>/giu)]
    .map((match) => decodeHtml(match[1] ?? ""));
  const linkNames = [...text.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/giu)]
    .map((match) => decodeHtml(match[1] ?? ""));
  const names = [...headingNames, ...linkNames];
  const noise = new Set([
    "about us", "accessibility", "contact", "contact us", "copyright", "departments and agencies",
    "find an agency", "government", "home", "menu", "ministers", "privacy", "search",
    "skip to content", "skip to main content", "website",
  ]);
  const likelyOrganisation = /\b(?:access|agency|appeals|assembly|authority|board|bureau|cabinet|commission|commissioner|council|court|department|directorate|education|electoral|environment|fair trading|fire|health|housing|infrastructure|justice|land|licensing|office|ombudsman|planning|police|public sector|births|deaths|marriages|registry|revenue|service|transport|treasury|tribunal|worksafe)\b/iu;

  const unique = new Map<string, string>();
  for (const name of names) {
    const identity = canonical(name);
    if (!identity || noise.has(identity) || name.length > 140 || !likelyOrganisation.test(name)) continue;
    if (!unique.has(identity)) unique.set(identity, name);
  }

  return [...unique.values()]
    .map((name) => makeCandidate(source, name, [], jurisdiction))
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

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, "&");
}

function spreadsheetColumnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/u)?.[0] ?? "";
  let value = 0;
  for (const letter of letters) value = value * 26 + (letter.charCodeAt(0) - 64);
  return Math.max(0, value - 1);
}

function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gu)].map((match) =>
    [...(match[1] ?? "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gu)]
      .map((text) => decodeXml(text[1] ?? ""))
      .join(""),
  );
}

function parseWorksheetRows(xml: string, sharedStrings: readonly string[]): string[][] {
  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gu)].map((rowMatch) => {
    const row: string[] = [];
    for (const cellMatch of (rowMatch[1] ?? "").matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gu)) {
      const attributes = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const reference = attributes.match(/\br=["']([^"']+)["']/u)?.[1] ?? "";
      const type = attributes.match(/\bt=["']([^"']+)["']/u)?.[1] ?? "";
      const index = spreadsheetColumnIndex(reference);
      const inline = body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/u)?.[1];
      const scalar = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/u)?.[1] ?? "";
      row[index] = type === "s"
        ? (sharedStrings[Number(scalar)] ?? "")
        : type === "inlineStr"
          ? decodeXml(inline ?? "")
          : decodeXml(scalar);
    }
    return row;
  });
}

function parseUsGovernmentUnits(source: GovernmentSourceDefinition, archivePath: string): Candidate[] {
  const members = execFileSync("unzip", ["-Z1", archivePath], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  const workbookMember = members.split(/\r?\n/u).find((name) => /\.xlsx$/iu.test(name));
  if (!workbookMember) throw new TypeError("US Census government-units archive does not contain an XLSX workbook.");

  const temporaryDirectory = mkdtempSync(join(tmpdir(), "budget-app-government-"));
  const workbookPath = join(temporaryDirectory, "government-units.xlsx");
  try {
    const workbookBytes = execFileSync("unzip", ["-p", archivePath, workbookMember], {
      encoding: "buffer",
      maxBuffer: 64 * 1024 * 1024,
    });
    writeFileSync(workbookPath, workbookBytes);

    const workbookMembers = execFileSync("unzip", ["-Z1", workbookPath], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    const sheetMember = workbookMembers
      .split(/\r?\n/u)
      .find((name) => /^xl\/worksheets\/sheet\d+\.xml$/u.test(name));
    if (!sheetMember) throw new TypeError("US Census government-units workbook has no worksheet XML.");

    let sharedStrings: string[] = [];
    if (workbookMembers.split(/\r?\n/u).includes("xl/sharedStrings.xml")) {
      const sharedXml = execFileSync("unzip", ["-p", workbookPath, "xl/sharedStrings.xml"], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      sharedStrings = parseSharedStrings(sharedXml);
    }

    const worksheetXml = execFileSync("unzip", ["-p", workbookPath, sheetMember], {
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
    });
    const rows = parseWorksheetRows(worksheetXml, sharedStrings);
    if (rows.length < 2) throw new TypeError("US Census government-units workbook does not contain data rows.");

    const headerCandidates = [
      "government name", "government unit name", "govt name", "gov name",
      "government_name", "government unit_name", "government_unit_name",
      "govt_name", "unit name", "unit_name", "name",
    ];
    let headerRowIndex = -1;
    let nameIndex = -1;
    let stateIndex = -1;
    for (let rowIndex = 0; rowIndex < Math.min(rows.length, 25); rowIndex += 1) {
      const headers = rows[rowIndex].map((value) => canonical(value ?? ""));
      const candidateNameIndex = headers.findIndex((value) => headerCandidates.includes(value));
      if (candidateNameIndex < 0) continue;
      headerRowIndex = rowIndex;
      nameIndex = candidateNameIndex;
      stateIndex = headers.findIndex((value) =>
        ["state", "state code", "state fips", "state fips code", "state_code", "state_fips", "fips state", "fips_state"].includes(value),
      );
      break;
    }

    if (headerRowIndex < 0 || nameIndex < 0) {
      const preview = rows.slice(0, 8).map((row) => row.join(" | ")).join("\n");
      throw new TypeError(`US Census government-units workbook has no recognised name column. First rows:\n${preview}`);
    }

    return rows.slice(headerRowIndex + 1)
      .map((row) => makeCandidate(
        source,
        row[nameIndex] ?? "",
        [],
        stateIndex >= 0 ? row[stateIndex] : undefined,
      ))
      .filter((candidate): candidate is Candidate => Boolean(candidate));
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

const parserById: Readonly<Record<string, (source: GovernmentSourceDefinition, text: string) => Candidate[]>> = {
  "au-agor": parseAu,
  "nz-government-a-z": parseNz,
  "gb-govuk-organisations": parseGb,
  "us-usagov-agencies": parseUs,
  "au-nsw-government-directory": parseAuStateDirectory,
  "au-vic-government-directory": parseAuStateDirectory,
  "au-qld-government-directory": parseAuStateDirectory,
  "au-wa-government-directory": parseAuStateDirectory,
  "au-sa-government-directory": parseAuStateDirectory,
  "au-tas-government-directory": parseAuStateDirectory,
  "au-act-government-directory": parseAuStateDirectory,
  "au-nt-government-directory": parseAuStateDirectory,
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

const KNOWN_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "AU:Australian Taxation Office": ["ATO"],
  "AU:Australian Electoral Commission": ["AEC"],
  "NZ:Inland Revenue": ["IRD"],
  "US:Internal Revenue Service": ["IRS"],
  "US:Social Security Administration": ["SSA"],
  "GB:HM Revenue & Customs": ["HMRC"],
  "GB:Driver and Vehicle Licensing Agency": ["DVLA"],
};

function enrichKnownAliases(candidate: Candidate): Candidate {
  const aliases = KNOWN_ALIASES[`${candidate.country}:${candidate.name}`];
  if (!aliases?.length) return candidate;
  return { ...candidate, aliases: [...new Set([...candidate.aliases, ...aliases])] };
}

const byIdentity = new Map<string, Candidate>();
const collisions: string[] = [];
for (const rawCandidate of all) {
  const candidate = enrichKnownAliases(rawCandidate);
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
