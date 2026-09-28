import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

interface ArtworkCandidate {
  readonly key: string;
  readonly name: string;
  readonly source?: string;
  readonly assetSource?: string;
  readonly status: string;
}

interface ArtworkManifest {
  readonly entries: readonly ArtworkCandidate[];
}

interface ApprovalEntry {
  readonly key: string;
  readonly name: string;
  readonly regions: readonly string[];
  readonly aliases: readonly string[];
  readonly category: "government" | "transport";
  readonly source: string;
  readonly assetSource: string;
  readonly assetPath: string;
}

interface ApprovalManifest {
  readonly entries: readonly ApprovalEntry[];
}

interface OfficialManifest {
  readonly version: number;
  readonly entries: Array<{
    readonly key: string;
    readonly assetPath: string;
    readonly source: string;
    readonly assetSource: string;
  }>;
}

const root = process.cwd();
const artworkPath = resolve(root, "tools/merchant-icons/manifests/government-artwork-candidates.json");
const approvalPath = resolve(root, "tools/merchant-icons/manifests/government-reviewed-batch-01.json");
const officialPath = resolve(root, "tools/merchant-icons/manifests/reviewed-official-assets.json");
const runtimePath = resolve(root, "apps/web/src/features/icons/merchantIconGovernmentExpansion.ts");
const publicRoot = resolve(root, "apps/web/public/merchant-icons");

const artwork = JSON.parse(await readFile(artworkPath, "utf8")) as ArtworkManifest;
const approvals = JSON.parse(await readFile(approvalPath, "utf8")) as ApprovalManifest;
const official = JSON.parse(await readFile(officialPath, "utf8")) as OfficialManifest;
const artworkByKey = new Map(artwork.entries.map((entry) => [entry.key, entry] as const));

function validateBytes(assetPath: string, bytes: Uint8Array): void {
  const extension = extname(assetPath).toLocaleLowerCase();
  const buffer = Buffer.from(bytes);
  const png = buffer.length >= 24
    && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && buffer.readUInt32BE(16) > 1
    && buffer.readUInt32BE(20) > 1;
  const jpeg = buffer.length >= 4
    && buffer[0] === 0xff && buffer[1] === 0xd8
    && buffer.at(-2) === 0xff && buffer.at(-1) === 0xd9;
  const webp = buffer.length >= 16
    && buffer.toString("ascii", 0, 4) === "RIFF"
    && buffer.toString("ascii", 8, 12) === "WEBP";
  const ico = buffer.length >= 22
    && buffer.readUInt16LE(0) === 0
    && buffer.readUInt16LE(2) === 1
    && buffer.readUInt16LE(4) > 0;
  const svg = /<svg(?:\s|>)/u.test(buffer.toString("utf8"));

  const valid = extension === ".png" ? png
    : extension === ".jpg" || extension === ".jpeg" ? jpeg
    : extension === ".webp" ? webp
    : extension === ".ico" ? ico || png || jpeg
    : extension === ".svg" ? svg
    : false;

  if (!valid) throw new TypeError(`Downloaded artwork does not match supported asset type: ${assetPath}`);
}

for (const approval of approvals.entries) {
  const candidate = artworkByKey.get(approval.key);
  if (!candidate) throw new TypeError(`Approved government key was not present in artwork probe: ${approval.key}`);
  if (candidate.status !== "candidate-agency-specific") {
    throw new TypeError(`Approved government key is not agency-specific: ${approval.key} (${candidate.status})`);
  }
  if (candidate.assetSource !== approval.assetSource) {
    throw new TypeError(`Artwork source changed for ${approval.key}; review required before promotion.`);
  }

  const response = await fetch(approval.assetSource, {
    headers: { "user-agent": "Mozilla/5.0", accept: "image/*,*/*;q=0.8" },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Artwork download failed for ${approval.key}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > 2_000_000) {
    throw new TypeError(`Artwork size is outside allowed bounds for ${approval.key}: ${bytes.length} bytes`);
  }
  validateBytes(approval.assetPath, bytes);
  const destination = resolve(publicRoot, approval.assetPath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}

const officialByKey = new Map(official.entries.map((entry) => [entry.key, entry] as const));
for (const approval of approvals.entries) {
  officialByKey.set(approval.key, {
    key: approval.key,
    assetPath: approval.assetPath,
    source: approval.source,
    assetSource: approval.assetSource,
  });
}
official.entries = [...officialByKey.values()].sort((left, right) => left.key.localeCompare(right.key));
await writeFile(officialPath, JSON.stringify(official, null, 2) + "\n");

const runtimeEntries = approvals.entries.map((entry) => `  {
    key: ${JSON.stringify(entry.key)},
    name: ${JSON.stringify(entry.name)},
    regions: ${JSON.stringify(entry.regions)},
    aliases: ${JSON.stringify(entry.aliases)},
    category: ${JSON.stringify(entry.category)},
    provenance: { kind: "official", reviewed: true },
    asset: { kind: "image", assetPath: ${JSON.stringify(entry.assetPath)} },
  }`).join(",\n");

await writeFile(runtimePath, `import type { MerchantIconCatalogueEntry } from "./merchantIconCatalogue.js";

export const GOVERNMENT_MERCHANT_ICON_EXPANSION: readonly MerchantIconCatalogueEntry[] = [
${runtimeEntries}
] as const;
`);

console.log(`Promoted ${approvals.entries.length} reviewed government artwork entries.`);
