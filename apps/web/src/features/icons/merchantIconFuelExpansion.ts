import type { MerchantIconCatalogueEntry } from "./merchantIconCatalogue.js";

export const FUEL_MERCHANT_ICON_EXPANSION: readonly MerchantIconCatalogueEntry[] = [
  { key: "ampol-au", name: "Ampol", regions: ["AU"], aliases: ["Ampol Foodary", "Ampol Service Station"], category: "fuel", provenance: { kind: "community", reviewed: true }, asset: { kind: "image", assetPath: "fuel/ampol.png" } },
  { key: "shell-au", name: "Shell", regions: ["AU"], aliases: ["Shell Australia", "Shell Service Station"], category: "fuel", provenance: { kind: "community", reviewed: true }, asset: { kind: "image", assetPath: "fuel/shell.png" } },
  { key: "reddy-express-au", name: "Reddy Express", regions: ["AU"], aliases: ["Reddy Express Shell"], category: "fuel", provenance: { kind: "community", reviewed: true }, asset: { kind: "image", assetPath: "fuel/reddy-express.png" } },
  { key: "metro-petroleum-au", name: "Metro Petroleum", regions: ["AU"], aliases: ["Metro Fuel", "Metro Petroleum Australia"], category: "fuel", provenance: { kind: "community", reviewed: true }, asset: { kind: "image", assetPath: "fuel/metro-petroleum.png" } },
  { key: "otr-au", name: "OTR", regions: ["AU"], aliases: ["On The Run", "OTR Australia"], category: "fuel", provenance: { kind: "community", reviewed: true }, asset: { kind: "image", assetPath: "fuel/otr.png" } },
  { key: "mobil-au", name: "Mobil", regions: ["AU"], aliases: ["Mobil Australia", "Mobil Service Station"], category: "fuel", provenance: { kind: "community", reviewed: true }, asset: { kind: "image", assetPath: "fuel/mobil.png" } },
  { key: "pearl-energy-au", name: "Pearl Energy", regions: ["AU"], aliases: ["Pearl Energy Australia"], category: "fuel", provenance: { kind: "community", reviewed: true }, asset: { kind: "image", assetPath: "fuel/pearl-energy.png" } },
  { key: "x-convenience-au", name: "X Convenience", regions: ["AU"], aliases: ["X Convenience Australia"], category: "fuel", provenance: { kind: "generated", reviewed: false }, asset: { kind: "sprite", spritePath: "fuel-fallbacks.svg", symbolId: "x-convenience-au" } },
  { key: "eg-ampol-au", name: "EG Ampol", regions: ["AU"], aliases: ["EG Australia"], category: "fuel", provenance: { kind: "generated", reviewed: false }, asset: { kind: "sprite", spritePath: "fuel-fallbacks.svg", symbolId: "eg-ampol-au" } },
] as const;

export const MERCHANT_ICON_ENTRY_OVERRIDES: Readonly<Record<string, Partial<MerchantIconCatalogueEntry>>> = {
  "anaconda-au": {
    category: "shopping",
    asset: { kind: "image", assetPath: "user-supplied/anaconda-au.png" },
  },
  "bp-au": {
    category: "fuel",
    provenance: { kind: "community", reviewed: true },
    asset: { kind: "image", assetPath: "fuel/bp.svg" },
  },
  "7-eleven-au": { category: "fuel" },
  "apco-service-stations-au": {
    category: "fuel",
    asset: { kind: "image", assetPath: "user-supplied/apco-service-stations-au.svg" },
  },
  "caltex-au": { category: "fuel" },
  "coles-express-au": { category: "fuel" },
  "united-petroleum-au": { category: "fuel" },
  "oom-energy-au": {
    category: "utilities",
    asset: { kind: "image", assetPath: "user-supplied/oom-energy-au.svg" },
  },
  "peter-alexander-au": {
    category: "clothing",
    asset: { kind: "image", assetPath: "user-supplied/peter-alexander-au.svg" },
  },
} as const;
