import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import {
  MERCHANT_ICON_CATALOGUE,
  normaliseMerchantIconIdentity,
  preloadExtendedMerchantIconCatalogue,
} from "../../apps/web/src/features/icons/merchantIconCatalogue.js";

await preloadExtendedMerchantIconCatalogue();

const root = process.cwd();
const errors: string[] = [];
const keys = new Map<string, string>();
const spriteSymbols = new Map<string, string>();
const identities = new Map<string, string>();
const identityEntries = new Map<string, typeof MERCHANT_ICON_CATALOGUE[number][]>();
const spriteCache = new Map<string, string>();
let reviewedArtworkCount = 0;
let generatedFallbackCount = 0;
const manifestDirectory = resolve(root, "tools/merchant-icons/manifests");
const officialManifest = JSON.parse(await readFile(resolve(manifestDirectory, "reviewed-official-assets.json"), "utf8")) as {
  entries: { key: string; assetPath: string; source: string; assetSource: string }[];
};
const communityManifest = JSON.parse(await readFile(resolve(manifestDirectory, "reviewed-community-assets.json"), "utf8")) as {
  entries: { key: string; asset: { kind: "sprite"; spritePath: string; symbolId: string } | { kind: "image"; assetPath: string }; source: string }[];
};
const simpleIconsManifest = JSON.parse(await readFile(resolve(manifestDirectory, "reviewed-simple-icons-assets.json"), "utf8")) as {
  entries: { key: string; asset: { kind: "sprite"; spritePath: string; symbolId: string }; source: string }[];
};
const baseArtworkManifest = JSON.parse(await readFile(resolve(manifestDirectory, "reviewed-base-assets.json"), "utf8")) as {
  entries: { key: string; asset: { kind: "sprite"; spritePath: string; symbolId: string }; source: string }[];
};
const retailArtworkManifest = JSON.parse(await readFile(resolve(manifestDirectory, "reviewed-retail-assets.json"), "utf8")) as {
  entries: { key: string; asset: { kind: "sprite"; spritePath: string; symbolId: string }; source: string }[];
};
const officialByKey = new Map(officialManifest.entries.map((entry) => [entry.key, entry]));
const communityByKey = new Map([
  ...communityManifest.entries,
  ...simpleIconsManifest.entries,
  ...baseArtworkManifest.entries,
  ...retailArtworkManifest.entries,
].map((entry) => [entry.key, entry]));
if (officialByKey.size !== officialManifest.entries.length) errors.push("Official provenance manifest contains duplicate keys.");
if (communityByKey.size !== communityManifest.entries.length + simpleIconsManifest.entries.length + baseArtworkManifest.entries.length + retailArtworkManifest.entries.length) errors.push("Community provenance manifests contain duplicate keys.");

async function readSprite(path: string): Promise<string | undefined> {
  const cached = spriteCache.get(path);
  if (cached !== undefined) return cached;
  try {
    const text = await readFile(resolve(root, "apps/web/public/merchant-icons", path), "utf8");
    spriteCache.set(path, text);
    return text;
  } catch {
    return undefined;
  }
}

async function validateImageAsset(key: string, assetPath: string): Promise<void> {
  try {
    const bytes = await readFile(resolve(root, "apps/web/public/merchant-icons", assetPath));
    const extension = extname(assetPath).toLocaleLowerCase();
    const png = bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.readUInt32BE(16) > 1 && bytes.readUInt32BE(20) > 1;
    const jpeg = bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
    const readable = extension === ".png" ? png
      : extension === ".jpg" || extension === ".jpeg" ? jpeg
      : extension === ".webp" ? bytes.length >= 16 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP"
      : extension === ".ico" ? bytes.length >= 22 && ((bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1 && bytes.readUInt16LE(4) > 0) || png || jpeg || bytes.toString("ascii", 0, 6) === "GIF89a" || bytes.toString("ascii", 0, 2) === "BM")
      : extension === ".svg" ? /<svg(?:\s|>)/u.test(bytes.toString("utf8"))
      : false;
    if (!readable) errors.push(`Merchant "${key}" references unreadable image asset "${assetPath}".`);
  } catch {
    errors.push(`Merchant "${key}" references missing asset "${assetPath}".`);
  }
}

for (const entry of MERCHANT_ICON_CATALOGUE) {
  const keyOwner = keys.get(entry.key);
  if (keyOwner) errors.push(`Duplicate merchant key "${entry.key}" (${keyOwner}, ${entry.name}).`);
  else keys.set(entry.key, entry.name);

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.key)) {
    errors.push(`Merchant key "${entry.key}" is not a stable lowercase slug.`);
  }

  if (!entry.name.trim()) errors.push(`Merchant "${entry.key}" has an empty display name.`);
  if (entry.regions.length === 0) errors.push(`Merchant "${entry.key}" has no region.`);
  if (!entry.category) errors.push(`Merchant "${entry.key}" has no category.`);
  if (!entry.provenance?.kind || typeof entry.provenance.reviewed !== "boolean") {
    errors.push(`Merchant "${entry.key}" has invalid provenance.`);
  }
  if (entry.provenance?.reviewed) reviewedArtworkCount += 1;
  if (entry.provenance?.kind === "generated" && entry.provenance.reviewed === false) {
    generatedFallbackCount += 1;
  }
  if (entry.provenance?.reviewed && entry.asset.kind === "sprite" && entry.asset.spritePath.startsWith("major-expansion-")) {
    errors.push(`Reviewed merchant "${entry.key}" references generated fallback sprite "${entry.asset.spritePath}".`);
  }
  if (entry.provenance?.kind === "generated" && entry.provenance.reviewed) {
    errors.push(`Generated merchant "${entry.key}" must not be marked reviewed.`);
  }
  if (entry.provenance?.kind === "official") {
    const manifestEntry = officialByKey.get(entry.key);
    if (!manifestEntry) {
      errors.push(`Official merchant "${entry.key}" has no official provenance manifest entry.`);
    } else {
      if (entry.asset.kind !== "image" || entry.asset.assetPath !== manifestEntry.assetPath) {
        errors.push(`Official merchant "${entry.key}" does not match its manifest asset.`);
      }
      if (!manifestEntry.source.startsWith("https://") || !manifestEntry.assetSource.startsWith("https://")) {
        errors.push(`Official merchant "${entry.key}" has invalid source URLs in its provenance manifest.`);
      }
    }
  }
  if (entry.provenance?.kind === "community") {
    const manifestEntry = communityByKey.get(entry.key);
    if (!manifestEntry) {
      errors.push(`Community merchant "${entry.key}" has no community provenance manifest entry.`);
    } else {
      const assetMatches = entry.asset.kind === manifestEntry.asset.kind && (
        entry.asset.kind === "image"
          ? entry.asset.assetPath === (manifestEntry.asset.kind === "image" ? manifestEntry.asset.assetPath : "")
          : manifestEntry.asset.kind === "sprite" &&
            entry.asset.spritePath === manifestEntry.asset.spritePath &&
            entry.asset.symbolId === manifestEntry.asset.symbolId
      );
      if (!assetMatches) {
        errors.push(`Community merchant "${entry.key}" does not match its manifest asset.`);
      }
      if (!manifestEntry.source.startsWith("https://")) {
        errors.push(`Community merchant "${entry.key}" has an invalid source URL in its provenance manifest.`);
      }
    }
  }

  for (const identity of [entry.name, ...entry.aliases]) {
    const normalised = normaliseMerchantIconIdentity(identity);
    if (!normalised) {
      errors.push(`Merchant "${entry.key}" contains an empty canonical identity.`);
      continue;
    }
    const matches = identityEntries.get(normalised) ?? [];
    if (!matches.some(({ key }) => key === entry.key)) matches.push(entry);
    identityEntries.set(normalised, matches);
    identities.set(normalised, entry.key);
  }

  if (entry.asset.kind === "image") {
    await validateImageAsset(entry.key, entry.asset.assetPath);
    continue;
  }

  const symbolOwner = spriteSymbols.get(entry.asset.symbolId);
  if (symbolOwner && symbolOwner !== entry.key) {
    errors.push(`Sprite symbol "${entry.asset.symbolId}" is shared by "${symbolOwner}" and "${entry.key}".`);
  } else {
    spriteSymbols.set(entry.asset.symbolId, entry.key);
  }

  const sprite = await readSprite(entry.asset.spritePath);
  if (sprite === undefined) {
    errors.push(`Merchant "${entry.key}" references missing sprite "${entry.asset.spritePath}".`);
    continue;
  }
  const escaped = entry.asset.symbolId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  if (!new RegExp(`<symbol\\s+id=["']${escaped}["'](?:\\s|>)`, "u").test(sprite)) {
    errors.push(`Merchant "${entry.key}" references missing symbol "${entry.asset.symbolId}" in "${entry.asset.spritePath}".`);
  }
}


for (const entry of officialManifest.entries) {
  if (MERCHANT_ICON_CATALOGUE.find(({ key }) => key === entry.key)?.provenance?.kind !== "official") {
    errors.push(`Official provenance manifest entry "${entry.key}" is not an official runtime entry.`);
  }
}
for (const entry of [...communityManifest.entries, ...simpleIconsManifest.entries, ...baseArtworkManifest.entries, ...retailArtworkManifest.entries]) {
  if (MERCHANT_ICON_CATALOGUE.find(({ key }) => key === entry.key)?.provenance?.kind !== "community") {
    errors.push(`Community provenance manifest entry "${entry.key}" is not a community runtime entry.`);
  }
}

for (const [identity, matches] of identityEntries) {
  if (matches.length < 2) continue;
  for (let index = 0; index < matches.length; index += 1) {
    for (const other of matches.slice(index + 1)) {
      const overlap = matches[index].regions.some((region) => other.regions.includes(region) || region === "GLOBAL" || other.regions.includes("GLOBAL"));
      if (overlap) errors.push(`Canonical identity "${identity}" collides in the same region between "${matches[index].key}" and "${other.key}".`);
    }
  }
}

if (errors.length) {
  console.error("Merchant icon catalogue validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Merchant icon catalogue valid: ${MERCHANT_ICON_CATALOGUE.length} entries, ${reviewedArtworkCount} reviewed artworks, ${generatedFallbackCount} generated fallbacks, ${identities.size} canonical identities, ${spriteCache.size} sprite shards, ${new Set(MERCHANT_ICON_CATALOGUE.flatMap(({ regions }) => regions)).size} regions.`,
);
