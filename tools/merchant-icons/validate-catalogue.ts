import { access } from "node:fs/promises";
import { resolve } from "node:path";
import {
  MERCHANT_ICON_CATALOGUE,
  normaliseMerchantIconIdentity,
} from "../../apps/web/src/features/icons/merchantIconCatalogue.js";

const root = process.cwd();
const errors: string[] = [];
const keys = new Map<string, string>();
const assetPaths = new Map<string, string>();
const identities = new Map<string, string>();

for (const entry of MERCHANT_ICON_CATALOGUE) {
  const keyOwner = keys.get(entry.key);
  if (keyOwner) errors.push(`Duplicate merchant key "${entry.key}" (${keyOwner}, ${entry.name}).`);
  else keys.set(entry.key, entry.name);

  const pathOwner = assetPaths.get(entry.assetPath);
  if (pathOwner) errors.push(`Duplicate merchant asset path "${entry.assetPath}" (${pathOwner}, ${entry.name}).`);
  else assetPaths.set(entry.assetPath, entry.name);

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.key)) {
    errors.push(`Merchant key "${entry.key}" is not a stable lowercase slug.`);
  }

  if (!entry.name.trim()) errors.push(`Merchant "${entry.key}" has an empty display name.`);
  if (entry.regions.length === 0) errors.push(`Merchant "${entry.key}" has no region.`);

  for (const identity of [entry.name, ...entry.aliases]) {
    const normalised = normaliseMerchantIconIdentity(identity);
    if (!normalised) {
      errors.push(`Merchant "${entry.key}" contains an empty canonical identity.`);
      continue;
    }
    const owner = identities.get(normalised);
    if (owner && owner !== entry.key) {
      errors.push(`Canonical identity "${normalised}" is ambiguous between "${owner}" and "${entry.key}".`);
    } else {
      identities.set(normalised, entry.key);
    }
  }

  try {
    await access(resolve(root, "apps/web/public/merchant-icons", entry.assetPath));
  } catch {
    errors.push(`Merchant "${entry.key}" references missing asset "${entry.assetPath}".`);
  }
}

if (errors.length) {
  console.error("Merchant icon catalogue validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Merchant icon catalogue valid: ${MERCHANT_ICON_CATALOGUE.length} entries, ${identities.size} canonical identities.`,
);
