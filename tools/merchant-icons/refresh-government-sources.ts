import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GOVERNMENT_SOURCE_REGISTRY } from "./governmentSourceRegistry.js";

const root = process.cwd();
const snapshotDirectory = resolve(root, "tools/merchant-icons/sources/government");

async function getText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "budget-app merchant catalogue source snapshotter",
      "accept": "text/html,application/json,text/csv;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Government source request failed (${response.status}) for ${url}`);
  return response.text();
}

await mkdir(snapshotDirectory, { recursive: true });

for (const source of GOVERNMENT_SOURCE_REGISTRY) {
  const path = resolve(snapshotDirectory, source.snapshotFile);
  if (source.kind === "alphabetic-html") {
    // USAGov uses the root agency-index page for A, then letter-specific pages
    // for the remaining populated letters. Q, X, Y and Z do not have pages.
    const suffixes = ["", ..."bcdefghijklmnoprstuvw".split("")];
    const pages: string[] = [];
    for (const suffix of suffixes) {
      const url = suffix ? `${source.url}/${suffix}` : source.url;
      pages.push(await getText(url));
    }
    const body = pages.join("\n<!-- budget-app source page boundary -->\n");
    await writeFile(path, body);
    console.log(`Snapshotted ${source.id}: ${pages.length} alphabetic pages, ${body.length.toLocaleString()} bytes.`);
    continue;
  }
  if (source.kind === "zip-csv") {
    const response = await fetch(source.url, {
      headers: { "user-agent": "budget-app merchant catalogue source snapshotter" },
      redirect: "follow",
    });
    if (!response.ok) throw new Error(`Government source request failed (${response.status}) for ${source.url}`);
    const body = Buffer.from(await response.arrayBuffer());
    await writeFile(path, body);
    console.log(`Snapshotted ${source.id}: ${body.length.toLocaleString()} bytes.`);
    continue;
  }
  if (source.kind !== "paginated-json") {
    const body = await getText(source.url);
    await writeFile(path, body);
    console.log(`Snapshotted ${source.id}: ${body.length.toLocaleString()} bytes.`);
    continue;
  }

  const results: unknown[] = [];
  let next: string | null = source.url;
  let pages = 0;
  while (next) {
    const page = JSON.parse(await getText(next)) as {
      readonly results?: readonly unknown[];
      readonly next_page_url?: string | null;
    };
    if (!Array.isArray(page.results)) throw new TypeError(`Unexpected paginated government source shape for ${source.id}.`);
    results.push(...page.results);
    next = typeof page.next_page_url === "string" && page.next_page_url ? page.next_page_url : null;
    pages += 1;
    if (pages > 200) throw new RangeError(`Government source ${source.id} exceeded the pagination safety limit.`);
  }
  const body = JSON.stringify({ source: source.url, capturedAt: new Date().toISOString(), results }, null, 2) + "\n";
  await writeFile(path, body);
  console.log(`Snapshotted ${source.id}: ${results.length.toLocaleString()} organisations across ${pages} pages.`);
}
