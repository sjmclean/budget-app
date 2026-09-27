import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  MERCHANT_ICON_CATALOGUE,
  normaliseMerchantIconIdentity,
} from "../../apps/web/src/features/icons/merchantIconCatalogue.js";

const root = process.cwd();
const errors: string[] = [];
const keys = new Map<string, string>();
const spriteSymbols = new Map<string, string>();
const identities = new Map<string, string>();
const identityEntries = new Map<string, typeof MERCHANT_ICON_CATALOGUE[number][]>();
const spriteCache = new Map<string, string>();

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
    try {
      await access(resolve(root, "apps/web/public/merchant-icons", entry.asset.assetPath));
    } catch {
      errors.push(`Merchant "${entry.key}" references missing asset "${entry.asset.assetPath}".`);
    }
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
  `Merchant icon catalogue valid: ${MERCHANT_ICON_CATALOGUE.length} entries, ${identities.size} canonical identities, ${spriteCache.size} sprite shards, ${new Set(MERCHANT_ICON_CATALOGUE.flatMap(({ regions }) => regions)).size} regions.`,
);
