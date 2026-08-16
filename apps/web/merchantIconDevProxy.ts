import type { Plugin } from "vite";
import { MERCHANT_IDENTITY_CATALOGUE } from "./src/features/accounts/merchantIdentityCatalog.js";

const ROUTE = "/__merchant-icon-fetch";
const PAGE_LIMIT = 1024 * 1024;
const MANIFEST_LIMIT = 256 * 1024;
const ASSET_LIMIT = 512 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 5;

const allowedDomains = new Set(
  MERCHANT_IDENTITY_CATALOGUE.flatMap(({ officialDomains }) =>
    officialDomains.map(normaliseDomain),
  ),
);

export function merchantIconDevProxy(): Plugin {
  return {
    name: "budget-app-merchant-icon-dev-proxy",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url ?? "/", "http://localhost");
        if (requestUrl.pathname !== ROUTE) {
          next();
          return;
        }

        try {
          if (request.method !== "GET") {
            sendText(response, 405, "Method not allowed.");
            return;
          }

          const kind = requestUrl.searchParams.get("kind");
          const domain = normaliseDomain(requestUrl.searchParams.get("domain") ?? "");
          if (!allowedDomains.has(domain)) {
            sendText(response, 403, "Merchant domain is not in the Phase 1 catalogue.");
            return;
          }

          if (kind === "page") {
            const fetched = await fetchRestricted(`https://${domain}/`, domain, PAGE_LIMIT);
            const contentType = fetched.contentType.toLowerCase();
            if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
              sendText(response, 415, "Merchant page did not return HTML.");
              return;
            }
            response.statusCode = 200;
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.setHeader("Cache-Control", "no-store");
            response.end(JSON.stringify({
              url: fetched.url,
              html: new TextDecoder().decode(fetched.bytes),
            }));
            return;
          }

          const target = requestUrl.searchParams.get("target") ?? "";
          if (!target) {
            sendText(response, 400, "target is required.");
            return;
          }

          if (kind === "manifest") {
            const fetched = await fetchRestricted(target, domain, MANIFEST_LIMIT);
            let value: unknown;
            try {
              value = JSON.parse(new TextDecoder().decode(fetched.bytes));
            } catch {
              sendText(response, 415, "Merchant manifest was not valid JSON.");
              return;
            }
            response.statusCode = 200;
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.setHeader("Cache-Control", "no-store");
            response.end(JSON.stringify(value));
            return;
          }

          if (kind === "asset") {
            const fetched = await fetchRestricted(target, domain, ASSET_LIMIT);
            response.statusCode = 200;
            response.setHeader("Content-Type", fetched.contentType || "application/octet-stream");
            response.setHeader("Content-Length", String(fetched.bytes.byteLength));
            response.setHeader("Cache-Control", "no-store");
            response.setHeader("X-Merchant-Final-Url", fetched.url);
            response.end(Buffer.from(fetched.bytes));
            return;
          }

          sendText(response, 400, "Unsupported merchant fetch kind.");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Merchant fetch failed.";
          sendText(response, 502, message);
        }
      });
    },
  };
}

async function fetchRestricted(
  initialUrl: string,
  allowedDomain: string,
  maximumBytes: number,
): Promise<{ url: string; contentType: string; bytes: Uint8Array }> {
  let current = validateTarget(initialUrl, allowedDomain);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const fetched = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "User-Agent": "BudgetApp-MerchantIconDiscovery/1.0",
        Accept: "text/html,application/json,image/*;q=0.9,*/*;q=0.1",
      },
    });

    if (fetched.status >= 300 && fetched.status < 400) {
      const location = fetched.headers.get("location");
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new Error("Merchant request exceeded its redirect limit.");
      }
      current = validateTarget(new URL(location, current).toString(), allowedDomain);
      continue;
    }

    if (!fetched.ok) throw new Error(`Merchant site returned HTTP ${fetched.status}.`);
    const declaredLength = Number(fetched.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
      throw new Error("Merchant response exceeded the allowed size.");
    }

    const bytes = new Uint8Array(await fetched.arrayBuffer());
    if (bytes.byteLength > maximumBytes) {
      throw new Error("Merchant response exceeded the allowed size.");
    }
    return {
      url: current.toString(),
      contentType: fetched.headers.get("content-type") ?? "",
      bytes,
    };
  }

  throw new Error("Merchant request failed.");
}

function validateTarget(value: string, allowedDomain: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Only HTTPS merchant URLs are allowed.");
  if (url.username || url.password) throw new Error("Merchant URLs may not contain credentials.");
  if (url.port && url.port !== "443") throw new Error("Merchant URLs may only use HTTPS port 443.");

  const hostname = normaliseDomain(url.hostname);
  if (!isSameDomainOrSubdomain(hostname, allowedDomain)) {
    throw new Error("Merchant URL left the approved official domain.");
  }
  return url;
}

function isSameDomainOrSubdomain(hostname: string, allowedDomain: string): boolean {
  return hostname === allowedDomain || hostname.endsWith(`.${allowedDomain}`);
}

function normaliseDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./u, "").replace(/\.$/u, "");
}

function sendText(response: import("node:http").ServerResponse, statusCode: number, message: string): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(message);
}
