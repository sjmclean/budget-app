# Merchant Knowledge Phase 1

## Goal

Phase 1 resolves only obvious, high-confidence merchant identities and acquires artwork only from the merchant's known official domain. It is deliberately useful without GPS, inferred user location, social media, paid logo providers, or fuzzy web search.

## Identity path

```text
raw payee
  -> existing merchant normalisation
  -> exact alias or explicit descriptor prefix
  -> canonical merchant identity
  -> known official domain
```

Unknown or ambiguous payees remain unresolved. A result is never manufactured from generic substring similarity.

The initial catalogue is intentionally conservative. Broad parent domains that are known to produce the wrong visual identity, historical aliases that would display a current parent brand, and region-ambiguous names without market evidence are excluded from this easy phase.

## Artwork path

For a resolved official domain, the acquisition service considers only site-declared metadata:

1. `apple-touch-icon`
2. web-app manifest icons
3. `rel=icon`
4. conventional `/favicon.ico` when the page declares no icon metadata
5. `og:image` as a lower-priority first-party candidate

Arbitrary inline page images are not scraped in Phase 1.

Downloaded bytes must have a valid PNG, JPEG, WebP, or ICO signature and must be no larger than 512 KiB. Declared Content-Type alone is never trusted.

## Persistence

Artwork bytes reuse the existing content-addressed attachment blob store. Merchant icon metadata is budget-scoped and records provenance separately from the shared blob:

```text
merchant identity
  -> official domain
  -> artwork source URL / kind / acquiredAt
  -> content:v1:<sha256>
```

Automatic merchant artwork is **not** written into `PayeeView.iconRef`. `iconRef` remains the explicit payee override. When it is automatic/empty, the payee icon resolver may use Merchant Knowledge; an explicit built-in or content icon always wins.

Content deletion is intentionally metadata-only in this phase. Because blobs are hash-deduplicated, physical deletion requires a later reference-aware orphan sweep.

## Development acquisition path

Vite development registers a same-origin `__merchant-icon-fetch` middleware. It is not a general-purpose proxy: requests must name a domain already present in the Phase 1 catalogue, redirects and assets must remain on that official domain or a subdomain, only HTTPS port 443 is accepted, response sizes are bounded, and requests time out.

When an Automatic payee icon is rendered in development:

```text
PayeeIcon
  -> deterministic merchant identity?
  -> existing Merchant Knowledge artwork?
  -> one discovery attempt per merchant/browser session
  -> official-domain metadata discovery
  -> validated content-addressed cache
  -> Merchant Knowledge provenance
  -> rerender from cached content
```

Unknown payees and explicit icon overrides never trigger merchant discovery.

This development path exists so Phase 1 can be exercised end to end without turning browser CORS limitations into a third-party logo dependency.

## Production network boundary

Browser code cannot reliably inspect arbitrary official merchant sites because of CORS. `merchantIconIngestion.ts` therefore depends on `MerchantIconNetworkPort` rather than calling third-party sites directly.

The development Vite middleware is intentionally **not** the production adapter. A production hosted/local-server implementation must preserve the same allow-listing intent and additionally be reviewed for server-side request-forgery protections, DNS/private-address handling, bounded streaming reads, redirect validation, timeouts, authentication/rate limiting, and deployment-level observability.

Phase 1 must not silently fall back to Brandfetch, Google favicon endpoints, DuckDuckGo, or another external logo provider.

## Future phases

Later phases may add location-bearing bank descriptors, budget-derived market context, public merchant profiles/social evidence, historical brands, and optional mobile location observations. None of those are prerequisites for Phase 1.
