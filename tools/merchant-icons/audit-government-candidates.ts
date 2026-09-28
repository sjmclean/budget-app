import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

interface Candidate {
  readonly key: string;
  readonly name: string;
  readonly country: "AU" | "NZ" | "GB" | "US";
  readonly jurisdiction?: string;
  readonly aliases: readonly string[];
  readonly sourceId: string;
}

interface Manifest {
  readonly candidateCount: number;
  readonly countryCounts: Readonly<Record<string, number>>;
  readonly candidates: readonly Candidate[];
}

const manifest = JSON.parse(
  await readFile(resolve(process.cwd(), "tools/merchant-icons/manifests/government-candidates.json"), "utf8"),
) as Manifest;

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

function findTerms(...terms: string[]): Candidate[] {
  const wanted = terms.map(canonical);
  return manifest.candidates.filter((candidate) => {
    const identities = [candidate.name, ...candidate.aliases].map(canonical);
    return wanted.some((term) => identities.some((identity) => identity === term || identity.includes(term)));
  });
}

const noisePatterns = [
  /^(about us|close|contact|contact us|feedback|help|home|menu|search|skip to main content)$/iu,
  /^(a-z index|for federal agencies|for the public|government benefits)$/iu,
];

const noise = manifest.candidates.filter(({ name }) => noisePatterns.some((pattern) => pattern.test(name.trim())));

const byName = new Map<string, Candidate[]>();
for (const candidate of manifest.candidates) {
  const identity = canonical(candidate.name);
  const matches = byName.get(identity) ?? [];
  matches.push(candidate);
  byName.set(identity, matches);
}
const duplicateNames = [...byName.entries()]
  .filter(([, matches]) => matches.length > 1)
  .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]));

const priorityGroups = {
  taxRevenue: findTerms(
    "Australian Taxation Office", "State Revenue Office", "Revenue NSW", "Queensland Revenue Office",
    "Inland Revenue", "HM Revenue and Customs", "Internal Revenue Service",
  ),
  citizenServices: findTerms(
    "Services Australia", "Centrelink", "Medicare", "Social Security Administration",
  ),
  identityRegistries: findTerms(
    "Births Deaths and Marriages", "Births Deaths Marriages", "Passport Office", "Home Affairs",
  ),
  transportLicensing: findTerms(
    "VicRoads", "Transport for NSW", "Department of Transport", "Driver and Vehicle Licensing Agency",
    "Department of Motor Vehicles", "DMV",
  ),
  education: findTerms("Department of Education", "Ministry of Education", "Education Department"),
  elections: findTerms("Australian Electoral Commission", "Electoral Commission", "Federal Election Commission"),
};

const sourceCounts = Object.fromEntries(
  [...new Set(manifest.candidates.map(({ sourceId }) => sourceId))]
    .sort()
    .map((sourceId) => [sourceId, manifest.candidates.filter((candidate) => candidate.sourceId === sourceId).length]),
);

const report = {
  candidateCount: manifest.candidateCount,
  countryCounts: manifest.countryCounts,
  sourceCounts,
  exactNavigationNoiseCount: noise.length,
  exactNavigationNoise: noise.slice(0, 50),
  duplicateCanonicalNameCount: duplicateNames.length,
  mostDuplicatedCanonicalNames: duplicateNames.slice(0, 30).map(([identity, matches]) => ({
    identity,
    count: matches.length,
    entries: matches.slice(0, 12).map(({ key, name, country, jurisdiction }) => ({ key, name, country, jurisdiction })),
  })),
  priorityCoverage: Object.fromEntries(
    Object.entries(priorityGroups).map(([group, candidates]) => [
      group,
      candidates.map(({ key, name, country, jurisdiction, aliases }) => ({ key, name, country, jurisdiction, aliases })),
    ]),
  ),
};

console.log(JSON.stringify(report, null, 2));
