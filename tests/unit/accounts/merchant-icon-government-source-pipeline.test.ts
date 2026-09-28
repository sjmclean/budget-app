import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GOVERNMENT_SOURCE_REGISTRY } from "../../../tools/merchant-icons/governmentSourceRegistry.js";

const refresh = readFileSync("tools/merchant-icons/refresh-government-sources.ts", "utf8");
const builder = readFileSync("tools/merchant-icons/build-government-candidates.ts", "utf8");
const catalogue = readFileSync("apps/web/src/features/icons/merchantIconCatalogue.ts", "utf8");

test("government source registry starts with authoritative AU, NZ, UK and US national sources", () => {
  assert.deepEqual(
    GOVERNMENT_SOURCE_REGISTRY.map(({ country }) => country).sort(),
    ["AU", "AU", "AU", "AU", "AU", "AU", "AU", "AU", "AU", "AU", "GB", "GB", "NZ", "US", "US"],
  );
  assert.ok(GOVERNMENT_SOURCE_REGISTRY.every(({ url }) => url.startsWith("https://")));
  assert.ok(GOVERNMENT_SOURCE_REGISTRY.some(({ id, authority }) => id === "au-agor" && /Department of Finance/u.test(authority)));
  assert.ok(GOVERNMENT_SOURCE_REGISTRY.some(({ id, authority }) => id === "gb-govuk-organisations" && /GOV\.UK/u.test(authority)));
  assert.ok(GOVERNMENT_SOURCE_REGISTRY.some(({ id, authority }) => id === "us-usagov-agencies" && /USAGov/u.test(authority)));
  assert.ok(GOVERNMENT_SOURCE_REGISTRY.some(({ id, authority }) => id === "nz-government-a-z" && /New Zealand Government/u.test(authority)));
  for (const jurisdiction of ["nsw", "vic", "qld", "wa", "sa", "tas", "act", "nt"]) {
    assert.ok(GOVERNMENT_SOURCE_REGISTRY.some(({ id }) => id === `au-${jurisdiction}-government-directory`));
  }
  assert.ok(GOVERNMENT_SOURCE_REGISTRY.some(({ id }) => id === "au-local-government-areas"));
  assert.ok(GOVERNMENT_SOURCE_REGISTRY.some(({ id }) => id === "gb-local-authorities"));
  assert.ok(GOVERNMENT_SOURCE_REGISTRY.some(({ id }) => id === "us-government-units-2026"));
});

test("government refresh is an explicit snapshot workflow rather than a build-time network dependency", () => {
  assert.match(refresh, /fetch\(url/u);
  assert.match(refresh, /next_page_url/u);
  assert.match(refresh, /arrayBuffer/u);
  assert.match(refresh, /alphabetic pages/u);
  assert.match(refresh, /abcdefghijklmnopqrstuvwxyz/u);
  assert.match(refresh, /tools\/merchant-icons\/sources\/government/u);
  assert.doesNotMatch(catalogue, /government-candidates|governmentSourceRegistry|merchantIconGovernment/u);
});

test("government candidate builder deduplicates by country and does not invent runtime artwork", () => {
  assert.match(builder, /Source inventory only/u);
  assert.match(builder, /country.*candidate\.jurisdiction.*canonical\(candidate\.name\)/su);
  assert.match(builder, /parseAuStateDirectory/u);
  assert.match(builder, /parseAuLocal/u);
  assert.match(builder, /<button\\b/u);
  assert.match(builder, /<h\[23\]\\b/u);
  assert.match(builder, /births\|deaths\|marriages/u);
  assert.match(builder, /Internal Revenue Service.*IRS/su);
  assert.match(builder, /Social Security Administration.*SSA/su);
  assert.match(builder, /parseGbLocal/u);
  assert.match(builder, /parseUsGovernmentUnits/u);
  assert.match(builder, /execFileSync\("unzip"/u);
  assert.match(builder, /\.xlsx\$\/iu/u);
  assert.match(builder, /xl\/sharedStrings\.xml/u);
  assert.match(builder, /parseWorksheetRows/u);
  assert.match(builder, /government name/u);
  assert.match(builder, /government unit_name/u);
  assert.match(builder, /unit_name/u);
  assert.match(builder, /fips_state/u);
  assert.match(builder, /gov-\$\{keySlug\}\$\{cleanJurisdiction/u);
  assert.match(builder, /source\.country\.toLocaleLowerCase/u);
  assert.doesNotMatch(builder, /provenance|assetPath|spritePath/u);
});
