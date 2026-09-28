import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

interface Candidate {
  readonly key: string;
  readonly name: string;
  readonly country: "AU" | "NZ" | "GB" | "US";
  readonly level: "federal" | "national" | "state-local" | "local";
  readonly aliases: readonly string[];
  readonly sourceId: string;
  readonly jurisdiction?: string;
  readonly website?: string;
}

interface Manifest {
  readonly candidates: readonly Candidate[];
}

const inputPath = resolve(process.cwd(), "tools/merchant-icons/manifests/government-candidates.json");
const outputPath = resolve(process.cwd(), "tools/merchant-icons/manifests/government-promotion-queue.json");
const manifest = JSON.parse(await readFile(inputPath, "utf8")) as Manifest;

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

const CORE_PAYEE_IDENTITIES = new Set([
  "Australian Taxation Office", "ATO",
  "Australian Electoral Commission", "AEC",
  "Internal Revenue Service", "IRS",
  "Social Security Administration", "SSA",
  "HM Revenue & Customs", "HM Revenue and Customs", "HMRC",
  "Inland Revenue", "IRD",
  "Services Australia", "Centrelink", "Medicare",
  "Births, Deaths and Marriages", "NSW Registry of Births, Deaths & Marriages",
  "HM Passport Office", "Department of Home Affairs",
  "Driver and Vehicle Licensing Agency", "DVLA",
  "Revenue NSW", "State Revenue Office", "Queensland Revenue Office",
  "VicRoads", "Transport for NSW",
].map(canonical));

function isCorePayee(candidate: Candidate): boolean {
  return [candidate.name, ...candidate.aliases]
    .map(canonical)
    .some((identity) => CORE_PAYEE_IDENTITIES.has(identity));
}

const HIGH_VALUE = [
  /tax|revenue|treasury|customs|internal revenue|inland revenue/iu,
  /social security|medicare|centrelink|services australia|benefits|pension/iu,
  /births?.*deaths?.*marriages?|registry|passport|home affairs|immigration/iu,
  /transport|roads?|motor vehicles?|licen[cs]ing|driver|vehicle/iu,
  /department of education|ministry of education/iu,
  /health department|department of health|ambulance service/iu,
  /police|sheriff|coroner/iu,
  /electoral commission|election commission/iu,
  /housing authority|land titles?|fair trading|worksafe|work safe|workcover/iu,
];

const LOW_VALUE = [
  /\bcommittee\b|\btaskforce\b|\bworking group\b|\bsteering group\b/iu,
  /\badvisory\b|\breview panel\b|\bcouncil\b/iu,
  /\btribunal\b|\bcourt\b|\bchamber\b/iu,
  /\bresearch\b|\bstrategy\b/iu,
];

const NOISE = [
  /\bwebsite\b/iu,
  /^(home|contact|contact us|about us|search|menu)$/iu,
];

function score(candidate: Candidate): number {
  let value = 0;
  if (candidate.level === "federal" || candidate.level === "national") value += 28;
  if (candidate.level === "state-local") value += 20;
  if (candidate.level === "local") value -= 24;
  if (candidate.jurisdiction) value += 4;
  if (candidate.aliases.length) value += Math.min(8, candidate.aliases.length * 2);

  const identity = `${candidate.name} ${candidate.aliases.join(" ")}`;
  if (isCorePayee(candidate)) value += 90;
  for (const pattern of HIGH_VALUE) if (pattern.test(identity)) value += 24;
  for (const pattern of LOW_VALUE) if (pattern.test(candidate.name)) value -= 36;
  for (const pattern of NOISE) if (pattern.test(candidate.name)) value -= 100;

  if (/^(city|county|town|village|borough|municipality|township|district) of\b/iu.test(candidate.name)) value -= 30;
  if (/\b(school district|fire district|water district|soil and water|library district)\b/iu.test(candidate.name)) value -= 32;
  if (candidate.name.length > 100) value -= 12;
  return value;
}

const deduped = new Map<string, Candidate>();
for (const candidate of manifest.candidates) {
  if (NOISE.some((pattern) => pattern.test(candidate.name))) continue;
  const normalizedName = canonical(
    candidate.name
      .replace(/\bwebsite\b/giu, "")
      .replace(/^u\.?s\.?\s+/iu, "")
      .replace(/^united states\s+/iu, ""),
  );
  const identity = `${candidate.country}:${candidate.jurisdiction ?? ""}:${normalizedName}`;
  const previous = deduped.get(identity);
  if (!previous || score(candidate) > score(previous)) deduped.set(identity, candidate);
}

const ranked = [...deduped.values()]
  .map((candidate) => ({ ...candidate, priorityScore: score(candidate) }))
  .filter(({ priorityScore }) => priorityScore >= 28)
  .sort((left, right) =>
    right.priorityScore - left.priorityScore
    || left.country.localeCompare(right.country)
    || left.name.localeCompare(right.name),
  );

const top = ranked.slice(0, 2500);
const byCountry = Object.fromEntries(
  ["AU", "NZ", "GB", "US"].map((country) => [country, top.filter((candidate) => candidate.country === country).length]),
);

await writeFile(outputPath, JSON.stringify({
  version: 1,
  purpose: "Prioritised artwork review queue only. Entries are not runtime catalogue records.",
  candidateCount: manifest.candidates.length,
  queuedCount: top.length,
  byCountry,
  candidates: top,
}, null, 2) + "\n");

console.log(`Government promotion queue: ${top.length.toLocaleString()} candidates.`);
console.log(`By country: ${Object.entries(byCountry).map(([country, count]) => `${country} ${count}`).join(", ")}.`);
console.log("Top 40:");
for (const candidate of top.slice(0, 40)) {
  console.log(`${String(candidate.priorityScore).padStart(3)}  ${candidate.country}${candidate.jurisdiction ? `/${candidate.jurisdiction}` : ""}  ${candidate.name}${candidate.aliases.length ? ` [${candidate.aliases.join(", ")}]` : ""}`);
}
