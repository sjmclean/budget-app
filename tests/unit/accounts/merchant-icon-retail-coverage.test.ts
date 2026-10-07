import assert from "node:assert/strict";
import { test } from "node:test";

import {
  findMerchantIconByPayeeName,
  preloadExtendedMerchantIconCatalogue,
} from "../../../apps/web/src/features/icons/merchantIconCatalogue.js";

const coverage: Readonly<Record<string, readonly string[]>> = {
  streaming: [
    "Netflix", "Stan", "Binge", "Disney+", "Prime Video", "Apple TV+", "Paramount+", "Max",
    "Tubi", "Kanopy", "DocPlay", "CuriosityStream", "Kayo Sports", "Stan Sport", "Spotify",
  ],
  pharmacy: [
    "Chemist Warehouse", "Priceline Pharmacy", "TerryWhite Chemmart", "Amcal",
    "Discount Drug Stores", "National Pharmacies", "Pharmacy 4 Less", "Blooms The Chemist",
  ],
  cinema: [
    "Event Cinemas", "HOYTS", "Village Cinemas", "Reading Cinemas", "Palace Cinemas", "Dendy Cinemas",
  ],
  groceries: [
    "Woolworths", "Coles", "ALDI", "FoodWorks", "Costco", "Drakes Supermarkets",
    "Harris Farm Markets", "Foodland", "Supabarn", "Spudshed",
  ],
  mobileRetail: [
    "Samsung Experience Store", "Telstra Shop", "Optus Store", "Vodafone Store", "Apple Store", "Mobileciti",
  ],
  bigBoxAndClothing: [
    "Bunnings", "Kmart", "Target", "BIG W", "JB Hi-Fi", "Officeworks", "Harvey Norman",
    "The Good Guys", "Spotlight", "BCF", "Supercheap Auto", "Peter Alexander", "DECJUBA",
  ],
  fuel: [
    "Ampol", "Shell", "BP", "Reddy Express", "Metro Petroleum", "OTR", "Mobil",
    "7-Eleven", "United Petroleum", "Liberty", "U-GO", "Caltex", "APCO Service Stations",
  ],
};

test("merchant catalogue retains broad AU retail and streaming coverage", async () => {
  await preloadExtendedMerchantIconCatalogue();

  for (const [group, names] of Object.entries(coverage)) {
    for (const name of names) {
      assert.ok(
        findMerchantIconByPayeeName(name, "AU"),
        `${group} coverage is missing ${name}`,
      );
    }
  }
});
