import type { MerchantIconCatalogueEntry } from "./merchantIconCatalogue.js";

export const PRIORITY_MERCHANT_ICON_EXPANSION: readonly MerchantIconCatalogueEntry[] = [
  {
    key: "jd-sports-global",
    name: "JD Sports",
    regions: ["GLOBAL"],
    aliases: ["JD Sports Australia", "JD Sports Fashion"],
    category: "clothing",
    provenance: { kind: "community", reviewed: true },
    asset: { kind: "image", assetPath: "community/jd-sports-global.svg" },
  },
  {
    key: "shein-global",
    name: "SHEIN",
    regions: ["GLOBAL"],
    aliases: ["Shein"],
    category: "clothing",
    provenance: { kind: "community", reviewed: true },
    asset: { kind: "image", assetPath: "community/shein-global.svg" },
  },
  {
    key: "chatgpt-global",
    name: "ChatGPT",
    regions: ["GLOBAL"],
    aliases: ["Chat GPT", "OpenAI ChatGPT"],
    category: "digital",
    provenance: { kind: "community", reviewed: true },
    asset: { kind: "image", assetPath: "community/chatgpt-global.svg" },
  },
] as const;
