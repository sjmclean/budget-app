import { createServer } from "node:http";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { MERCHANT_ICON_CATALOGUE, type MerchantIconCatalogueEntry } from "../../apps/web/src/features/icons/merchantIconCatalogue.js";

const root = process.cwd();
const outputDirectory = resolve(root, "test-results/merchant-icon-review");
const merchantAssetDirectory = resolve(root, "apps/web/public/merchant-icons");
const sheetSize = 60;

const provenanceLabels = {
  official: "Official",
  community: "Community",
  generated: "Generated fallback — artwork still required",
} as const;

type ReviewEntry = MerchantIconCatalogueEntry & { readonly bucket: string };

function reviewedBucket(entry: MerchantIconCatalogueEntry): string {
  if (["utilities", "water", "gas", "electricity", "internet", "mobile", "telecom"].includes(entry.category ?? "")) return "02-utilities-and-telecom";
  if (["finance", "bank", "credit-union"].includes(entry.category ?? "")) return "03-banks-and-finance";
  if (["health", "health-insurance", "insurance"].includes(entry.category ?? "")) return "04-health-and-insurance";
  if (["airline", "travel", "transport", "car-rental", "parking"].includes(entry.category ?? "")) return "05-airlines-travel-and-parking";
  if (["shopping", "clothing", "groceries", "home", "electronics", "marketplace", "fuel"].includes(entry.category ?? "")) return "06-retail-and-clothing";
  if (["streaming-video", "streaming-music", "streaming-sport", "gaming-subscription", "digital", "entertainment", "sport"].includes(entry.category ?? "")) return "07-streaming-digital-and-entertainment";
  if (["local-government", "government"].includes(entry.category ?? "")) {
    return entry.regions.some((region) => region === "AU" || region === "NZ")
      ? "08-local-government-au-nz"
      : "09-local-government-international";
  }
  return "10-other-global-brands";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
}

function assetMarkup(entry: MerchantIconCatalogueEntry): string {
  if (entry.asset.kind === "image") {
    return `<img src="/merchant-icons/${escapeHtml(entry.asset.assetPath)}" alt="" loading="eager">`;
  }
  return `<svg aria-hidden="true" viewBox="0 0 40 40"><use href="/merchant-icons/${escapeHtml(entry.asset.spritePath)}#${escapeHtml(entry.asset.symbolId)}"></use></svg>`;
}

function tileMarkup(entry: MerchantIconCatalogueEntry): string {
  const provenance = entry.provenance?.kind ?? "generated";
  const fallback = provenance === "generated";
  return `<article class="merchant-tile" data-reviewed="${fallback ? "fallback" : "reviewed"}" data-category="${escapeHtml(entry.category ?? "other")}" data-region="${escapeHtml(entry.regions.join(" "))}" data-provenance="${provenance}">
    <div class="artwork ${fallback ? "fallback" : ""}">${assetMarkup(entry)}</div>
    <strong title="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</strong>
    <small class="key">${escapeHtml(entry.key)}</small>
    <small class="metadata">${escapeHtml(entry.category ?? "other")} · ${escapeHtml(entry.regions.join(", "))}</small>
    <span class="provenance ${provenance}">${escapeHtml(provenanceLabels[provenance])}</span>
  </article>`;
}

function balancedChunks<T>(items: readonly T[]): T[][] {
  const count = Math.ceil(items.length / sheetSize);
  if (count <= 1) return [[...items]];
  const base = Math.floor(items.length / count);
  const remainder = items.length % count;
  const chunks: T[][] = [];
  let offset = 0;
  for (let index = 0; index < count; index += 1) {
    const size = base + (index < remainder ? 1 : 0);
    chunks.push(items.slice(offset, offset + size));
    offset += size;
  }
  return chunks;
}

const reviewedEntries: ReviewEntry[] = MERCHANT_ICON_CATALOGUE
  .filter((entry) => entry.provenance?.reviewed)
  .map((entry) => ({ ...entry, bucket: reviewedBucket(entry) }));
const fallbackEntries = MERCHANT_ICON_CATALOGUE.filter((entry) => entry.provenance?.kind === "generated" && !entry.provenance.reviewed);

const reviewedGroups = new Map<string, ReviewEntry[]>();
for (const entry of reviewedEntries) {
  const group = reviewedGroups.get(entry.bucket) ?? [];
  group.push(entry);
  reviewedGroups.set(entry.bucket, group);
}

const sheets: { id: string; title: string; entries: MerchantIconCatalogueEntry[]; kind: "reviewed" | "fallback" }[] = [];
const orderedReviewedEntries = [...reviewedGroups]
  .sort(([left], [right]) => left.localeCompare(right))
  .flatMap(([, entries]) => entries);
balancedChunks(orderedReviewedEntries).forEach((chunk, index, chunks) => {
  const firstBucket = (chunk[0] as ReviewEntry).bucket.replace(/^\d+-/u, "").replaceAll("-", " ");
  const lastBucket = (chunk.at(-1) as ReviewEntry).bucket.replace(/^\d+-/u, "").replaceAll("-", " ");
  sheets.push({
    id: `reviewed-${String(index + 1).padStart(2, "0")}`,
    title: `Reviewed artwork (${index + 1}/${chunks.length}) — ${firstBucket}${firstBucket === lastBucket ? "" : ` / ${lastBucket}`}`,
    entries: chunk,
    kind: "reviewed",
  });
});
balancedChunks(fallbackEntries).forEach((chunk, index, chunks) => {
  sheets.push({
    id: `fallback-${String(index + 1).padStart(2, "0")}`,
    title: `Generated fallback — artwork still required (${index + 1}/${chunks.length})`,
    entries: chunk,
    kind: "fallback",
  });
});

const categories = [...new Set(MERCHANT_ICON_CATALOGUE.map((entry) => entry.category ?? "other"))].sort();
const regions = [...new Set(MERCHANT_ICON_CATALOGUE.flatMap((entry) => entry.regions))].sort();
const provenanceKinds = [...new Set(MERCHANT_ICON_CATALOGUE.map((entry) => entry.provenance?.kind ?? "generated"))].sort();

const css = `
  :root { color: #172033; background: #eef1f5; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 28px; }
  h1 { margin: 0 0 8px; font-size: 28px; }
  h2 { margin: 0; font-size: 22px; text-transform: capitalize; }
  .summary { margin: 0 0 22px; color: #556176; }
  .filters { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 12px; padding: 14px; margin-bottom: 24px; background: rgba(255,255,255,.96); border: 1px solid #d7dce5; border-radius: 12px; box-shadow: 0 4px 18px rgba(23,32,51,.08); }
  label { display: grid; gap: 4px; color: #556176; font-size: 12px; }
  select { min-width: 150px; padding: 7px 9px; border: 1px solid #bcc5d3; border-radius: 7px; background: white; color: #172033; }
  .catalogue-grid, .sheet-grid { display: grid; grid-template-columns: repeat(6, 220px); gap: 14px; }
  .catalogue-grid { grid-template-columns: repeat(auto-fill, minmax(205px, 1fr)); }
  .merchant-tile { min-width: 0; min-height: 164px; display: flex; flex-direction: column; align-items: center; padding: 12px 10px 10px; overflow: hidden; background: #fff; border: 1px solid #d8dde6; border-radius: 10px; box-shadow: 0 1px 3px rgba(23,32,51,.07); text-align: center; }
  .artwork { width: 92px; height: 92px; display: grid; place-items: center; margin-bottom: 7px; overflow: hidden; border: 1px solid #ccd2dc; border-radius: 10px; background-color: #f8f9fb; background-image: linear-gradient(45deg,#e6e9ee 25%,transparent 25%),linear-gradient(-45deg,#e6e9ee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e6e9ee 75%),linear-gradient(-45deg,transparent 75%,#e6e9ee 75%); background-size: 16px 16px; background-position: 0 0,0 8px,8px -8px,-8px 0; }
  .artwork::before { content: ""; position: absolute; width: 82px; height: 82px; border-radius: 8px; background: rgba(255,255,255,.86); }
  .artwork { position: relative; }
  .artwork img, .artwork svg { position: relative; z-index: 1; display: block; width: 78px; height: 78px; object-fit: contain; }
  .artwork.fallback img, .artwork.fallback svg { width: 72px; height: 72px; }
  strong { width: 100%; min-height: 19px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
  small { width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .key { color: #788499; font: 10px ui-monospace, SFMono-Regular, Consolas, monospace; }
  .metadata { margin-top: 2px; color: #657186; font-size: 10px; }
  .provenance { margin-top: 6px; padding: 2px 7px; border-radius: 999px; background: #e9edf3; color: #465269; font-size: 9px; font-weight: 700; }
  .provenance.official { background: #dff4e7; color: #17623a; }
  .provenance.community { background: #e6e7fb; color: #403a8a; }
  .provenance.generated { background: #fff0d6; color: #80510b; }
  .review-sheet { width: 1440px; margin: 0 0 28px; padding: 28px 32px 32px; background: #f3f5f8; border: 1px solid #cdd4df; }
  .sheet-heading { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 18px; }
  .sheet-heading p { margin: 0; color: #657186; }
  #sheets { margin-top: 42px; }
  .capture-mode > h1, .capture-mode > .summary, .capture-mode > .filters, .capture-mode > #catalogue { display: none; }
  .capture-mode #sheets { margin-top: 0; }
  .hidden { display: none !important; }
  @media print { .filters, #catalogue { display: none; } body { padding: 0; } .review-sheet { break-after: page; margin: 0; border: 0; } }
`;

const optionMarkup = (values: readonly string[]) => values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
const sheetMarkup = sheets.map((sheet) => `<section class="review-sheet" id="sheet-${sheet.id}" data-sheet-kind="${sheet.kind}">
  <header class="sheet-heading"><h2>${escapeHtml(sheet.title)}</h2><p>${sheet.entries.length} merchants</p></header>
  <div class="sheet-grid">${sheet.entries.map(tileMarkup).join("")}</div>
</section>`).join("");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Merchant icon catalogue review</title><style>${css}</style></head><body>
  <h1>Merchant icon catalogue visual review</h1>
  <p class="summary">760 identities · 503 reviewed artworks · 257 generated fallbacks · production assets rendered directly</p>
  <div class="filters">
    <label>Status<select id="status"><option value="">All</option><option value="reviewed">Reviewed</option><option value="fallback">Fallback</option></select></label>
    <label>Category<select id="category"><option value="">All</option>${optionMarkup(categories)}</select></label>
    <label>Region<select id="region"><option value="">All</option>${optionMarkup(regions)}</select></label>
    <label>Provenance<select id="provenance"><option value="">All</option>${optionMarkup(provenanceKinds)}</select></label>
  </div>
  <main id="catalogue" class="catalogue-grid">${MERCHANT_ICON_CATALOGUE.map(tileMarkup).join("")}</main>
  <div id="sheets">${sheetMarkup}</div>
  <script>
    const controls = [...document.querySelectorAll('.filters select')];
    function applyFilters() {
      const values = Object.fromEntries(controls.map(control => [control.id, control.value]));
      document.querySelectorAll('#catalogue .merchant-tile').forEach(tile => {
        const visible = (!values.status || tile.dataset.reviewed === values.status)
          && (!values.category || tile.dataset.category === values.category)
          && (!values.region || tile.dataset.region.split(' ').includes(values.region))
          && (!values.provenance || tile.dataset.provenance === values.provenance);
        tile.classList.toggle('hidden', !visible);
      });
    }
    controls.forEach(control => control.addEventListener('change', applyFilters));
  </script>
</body></html>`;

await mkdir(outputDirectory, { recursive: true });
for (const file of await readdir(outputDirectory)) {
  if (/\.(?:html|json|png)$/u.test(file)) await unlink(resolve(outputDirectory, file));
}
await writeFile(resolve(outputDirectory, "index.html"), html);
await writeFile(resolve(outputDirectory, "manifest.json"), `${JSON.stringify({
  total: MERCHANT_ICON_CATALOGUE.length,
  reviewed: reviewedEntries.length,
  fallback: fallbackEntries.length,
  sheets: sheets.map(({ id, title, kind, entries }) => ({ id, title, kind, count: entries.length, file: `${id}.png` })),
}, null, 2)}\n`);

const mimeTypes: Record<string, string> = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".json": "application/json" };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const path = url.pathname === "/" || url.pathname === "/review/" ? resolve(outputDirectory, "index.html")
      : url.pathname.startsWith("/merchant-icons/") ? resolve(merchantAssetDirectory, url.pathname.slice("/merchant-icons/".length))
        : resolve(outputDirectory, url.pathname.replace(/^\/review\//u, ""));
    const bytes = await readFile(path);
    response.writeHead(200, { "content-type": mimeTypes[extname(path).toLocaleLowerCase()] ?? "application/octet-stream" });
    response.end(bytes);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Review server did not bind to a TCP port.");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
  const failedRequests: string[] = [];
  page.on("requestfailed", (request) => failedRequests.push(`${request.url()}: ${request.failure()?.errorText ?? "failed"}`));
  await page.goto(`http://127.0.0.1:${address.port}/review/`, { waitUntil: "networkidle" });
  const renderedCounts = await page.evaluate(() => ({
    catalogue: document.querySelectorAll("#catalogue .merchant-tile").length,
    reviewed: document.querySelectorAll('#catalogue .merchant-tile[data-reviewed="reviewed"]').length,
    fallback: document.querySelectorAll('#catalogue .merchant-tile[data-reviewed="fallback"]').length,
    sheetTiles: document.querySelectorAll("#sheets .merchant-tile").length,
  }));
  const expectedCounts = {
    catalogue: MERCHANT_ICON_CATALOGUE.length,
    reviewed: reviewedEntries.length,
    fallback: fallbackEntries.length,
    sheetTiles: MERCHANT_ICON_CATALOGUE.length,
  };
  if (JSON.stringify(renderedCounts) !== JSON.stringify(expectedCounts)) {
    throw new Error(`Incomplete review output: expected ${JSON.stringify(expectedCounts)}, rendered ${JSON.stringify(renderedCounts)}.`);
  }
  const imageFailures = await page.locator("img").evaluateAll((images) => images.filter((image) => !image.complete || image.naturalWidth === 0 || image.naturalHeight === 0).map((image) => image.getAttribute("src") ?? "unknown"));
  if (failedRequests.length || imageFailures.length) throw new Error(`Asset load failures:\n${[...failedRequests, ...imageFailures].join("\n")}`);
  await page.evaluate(() => document.body.classList.add("capture-mode"));
  for (const sheet of sheets) {
    await page.locator(`#sheet-${sheet.id}`).screenshot({ path: resolve(outputDirectory, `${sheet.id}.png`) });
  }
} finally {
  await browser.close();
  await new Promise<void>((closed) => server.close(() => closed()));
}

console.log(`Generated ${sheets.length} contact sheets in ${outputDirectory}.`);
console.log(`Reviewed artworks: ${reviewedEntries.length}; generated fallbacks: ${fallbackEntries.length}.`);
