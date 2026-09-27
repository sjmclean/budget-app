import type { MerchantIconCatalogueEntry } from "./merchantIconCatalogue.js";

export const FUEL_MERCHANT_ICON_EXPANSION: readonly MerchantIconCatalogueEntry[] = [
  { key: "ampol-au", name: "Ampol", regions: ["AU"], aliases: ["Ampol Foodary", "Ampol Service Station"], category: "fuel", provenance: { kind: "generated", reviewed: false }, asset: { kind: "sprite", spritePath: "fuel-fallbacks.svg", symbolId: "ampol-au" } },
  { key: "shell-au", name: "Shell", regions: ["AU"], aliases: ["Shell Australia", "Shell Service Station"], category: "fuel", provenance: { kind: "community", reviewed: true }, asset: { kind: "sprite", spritePath: "fuel-reviewed.svg", symbolId: "shell-au" } },
  { key: "reddy-express-au", name: "Reddy Express", regions: ["AU"], aliases: ["Reddy Express Shell"], category: "fuel", provenance: { kind: "generated", reviewed: false }, asset: { kind: "sprite", spritePath: "fuel-fallbacks.svg", symbolId: "reddy-express-au" } },
  { key: "metro-petroleum-au", name: "Metro Petroleum", regions: ["AU"], aliases: ["Metro Fuel", "Metro Petroleum Australia"], category: "fuel", provenance: { kind: "generated", reviewed: false }, asset: { kind: "sprite", spritePath: "fuel-fallbacks.svg", symbolId: "metro-petroleum-au" } },
  { key: "otr-au", name: "OTR", regions: ["AU"], aliases: ["On The Run", "OTR Australia"], category: "fuel", provenance: { kind: "generated", reviewed: false }, asset: { kind: "sprite", spritePath: "fuel-fallbacks.svg", symbolId: "otr-au" } },
  { key: "mobil-au", name: "Mobil", regions: ["AU"], aliases: ["Mobil Australia", "Mobil Service Station"], category: "fuel", provenance: { kind: "generated", reviewed: false }, asset: { kind: "sprite", spritePath: "fuel-fallbacks.svg", symbolId: "mobil-au" } },
  { key: "pearl-energy-au", name: "Pearl Energy", regions: ["AU"], aliases: ["Pearl Energy Australia"], category: "fuel", provenance: { kind: "generated", reviewed: false }, asset: { kind: "sprite", spritePath: "fuel-fallbacks.svg", symbolId: "pearl-energy-au" } },
  { key: "x-convenience-au", name: "X Convenience", regions: ["AU"], aliases: ["X Convenience Australia"], category: "fuel", provenance: { kind: "generated", reviewed: false }, asset: { kind: "sprite", spritePath: "fuel-fallbacks.svg", symbolId: "x-convenience-au" } },
  { key: "eg-ampol-au", name: "EG Ampol", regions: ["AU"], aliases: ["EG Australia"], category: "fuel", provenance: { kind: "generated", reviewed: false }, asset: { kind: "sprite", spritePath: "fuel-fallbacks.svg", symbolId: "eg-ampol-au" } },
] as const;
