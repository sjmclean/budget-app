import { resolveMerchantIdentity } from "./features/accounts/merchantIdentityResolver.js";
import {
  discoverManifestUrl,
  discoverMerchantArtworkCandidates,
} from "./features/icons/merchantFirstPartyAssetDiscovery.js";
import { validateMerchantIconBytes } from "./features/icons/merchantIconContentStore.js";
import { createSameOriginMerchantIconNetworkPort } from "./features/icons/merchantIconNetworkClient.js";

const examples = [
  "Coles",
  "CWH GREENSBOROUGH PLAZA 0123",
  "Bunnings",
  "Officeworks",
  "Leaptel",
  "WILSONS PARKING MELBOURNE",
  "ELITE ELEVEN DONCASTER",
  "Woolworths",
  "Kmart",
  "Target",
  "Sculli Brothers",
];

const form = requiredElement<HTMLFormElement>("merchant-form");
const input = requiredElement<HTMLInputElement>("merchant-input");
const result = requiredElement<HTMLElement>("result");
const examplesHost = requiredElement<HTMLElement>("examples");

for (const example of examples) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = example;
  button.addEventListener("click", () => {
    input.value = example;
    void run(example);
  });
  examplesHost.append(button);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void run(input.value);
});

async function run(rawPayee: string): Promise<void> {
  revokeCurrentObjectUrl();
  const source = rawPayee.trim();
  if (!source) {
    result.innerHTML = '<span class="bad">Enter a payee string.</span>';
    return;
  }

  const identity = resolveMerchantIdentity(source);
  if (!identity) {
    result.innerHTML = `
      <div class="summary">
        <span class="label">Raw payee</span><strong>${escapeHtml(source)}</strong>
        <span class="label">Identity</span><span class="bad">Unresolved by strict Phase 1</span>
        <span class="label">Network</span><span class="muted">Not attempted</span>
      </div>`;
    return;
  }

  const domain = identity.merchant.officialDomains[0];
  result.innerHTML = `
    <div class="summary">
      <span class="label">Raw payee</span><strong>${escapeHtml(source)}</strong>
      <span class="label">Identity</span><span class="ok">${escapeHtml(identity.merchant.canonicalName)}</span>
      <span class="label">Match</span><span>${escapeHtml(identity.kind)} · ${escapeHtml(identity.matchedValue)}</span>
      <span class="label">Domain</span><code>${escapeHtml(domain ?? "none")}</code>
      <span class="label">Artwork</span><span>Fetching official site…</span>
    </div>`;

  if (!domain) return;

  const network = createSameOriginMerchantIconNetworkPort();
  try {
    const page = await network.fetchOfficialPage(domain);
    const manifestUrl = discoverManifestUrl(page.html, page.url);
    let manifest = null;
    if (manifestUrl) {
      try {
        manifest = await network.fetchManifest(manifestUrl);
      } catch {
        manifest = null;
      }
    }
    const candidates = discoverMerchantArtworkCandidates({
      html: page.html,
      pageUrl: page.url,
      manifest,
      manifestUrl,
    });

    let accepted: {
      kind: string;
      url: string;
      mimeType: string;
      objectUrl: string;
    } | null = null;
    const attempts: Array<{ kind: string; url: string; outcome: string }> = [];

    for (const candidate of candidates) {
      try {
        const asset = await network.fetchAsset(candidate.url);
        const mimeType = validateMerchantIconBytes(asset.bytes, asset.contentType);
        if (!mimeType) {
          attempts.push({ kind: candidate.kind, url: candidate.url, outcome: "rejected bytes" });
          continue;
        }
        const blob = new Blob([Uint8Array.from(asset.bytes)], { type: mimeType });
        const objectUrl = URL.createObjectURL(blob);
        accepted = { kind: candidate.kind, url: asset.url, mimeType, objectUrl };
        currentObjectUrl = objectUrl;
        attempts.push({ kind: candidate.kind, url: asset.url, outcome: `accepted ${mimeType}` });
        break;
      } catch (error) {
        attempts.push({ kind: candidate.kind, url: candidate.url, outcome: errorMessage(error) });
      }
    }

    const attemptHtml = attempts.length
      ? `<div class="candidate-list"><strong>Candidate attempts</strong><ol>${attempts.map((attempt) =>
          `<li><code>${escapeHtml(attempt.kind)}</code> — ${escapeHtml(attempt.outcome)}<br><code>${escapeHtml(attempt.url)}</code></li>`
        ).join("")}</ol></div>`
      : '<div class="candidate-list bad">No first-party icon metadata or conventional favicon candidate was discovered.</div>';

    result.innerHTML = `
      <div class="summary">
        <span class="label">Raw payee</span><strong>${escapeHtml(source)}</strong>
        <span class="label">Identity</span><span class="ok">${escapeHtml(identity.merchant.canonicalName)}</span>
        <span class="label">Match</span><span>${escapeHtml(identity.kind)} · ${escapeHtml(identity.matchedValue)}</span>
        <span class="label">Domain</span><code>${escapeHtml(domain)}</code>
        <span class="label">Page</span><code>${escapeHtml(page.url)}</code>
        <span class="label">Candidates</span><span>${candidates.length}</span>
        <span class="label">Artwork</span><span class="${accepted ? "ok" : "bad"}">${accepted ? `Accepted ${escapeHtml(accepted.kind)}` : "No usable first-party artwork"}</span>
      </div>
      ${accepted ? `<div class="icon-row"><div class="icon-box"><img src="${accepted.objectUrl}" alt=""></div><div><strong>${escapeHtml(identity.merchant.canonicalName)}</strong><br><code>${escapeHtml(accepted.mimeType)}</code><br><code>${escapeHtml(accepted.url)}</code></div></div>` : ""}
      ${attemptHtml}`;
  } catch (error) {
    result.innerHTML = `
      <div class="summary">
        <span class="label">Raw payee</span><strong>${escapeHtml(source)}</strong>
        <span class="label">Identity</span><span class="ok">${escapeHtml(identity.merchant.canonicalName)}</span>
        <span class="label">Domain</span><code>${escapeHtml(domain)}</code>
        <span class="label">Fetch</span><span class="bad">${escapeHtml(errorMessage(error))}</span>
      </div>`;
  }
}

let currentObjectUrl: string | null = null;

function revokeCurrentObjectUrl(): void {
  if (!currentObjectUrl) return;
  URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = null;
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}.`);
  return element as T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[character] ?? character));
}

void run(input.value);
