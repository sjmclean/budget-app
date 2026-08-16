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

The initial catalogue is intentionally conservative. Broad parent domains that are known to produce the wrong visual identity (for example a product name represented only by an umbrella government favicon) and historical aliases that would display a current parent brand are excluded from this easy phase.

## Artwork path

For a resolved official domain, the acquisition service considers only site-declared metadata:

1. `apple-touch-icon`
2. web-app manifest icons
3. `rel=icon`
4. `og:image` as a lower-priority first-party candidate

Arbitrary inline page images are not scraped in Phase 1.

Downloaded bytes must have a valid PNG, JPEG, or WebP signature and must be no larger than 512 KiB. Declared Content-Type alone is never trusted.

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

## Network boundary

Browser code cannot reliably inspect arbitrary official merchant sites because of CORS. `merchantIconIngestion.ts` therefore depends on `MerchantIconNetworkPort` rather than calling third-party sites directly.

A production adapter must run through a trusted same-origin/server boundary and must include SSRF protections, bounded response sizes, redirect validation, timeouts, and image byte validation. Until that adapter is wired, the identity, discovery, validation, caching, provenance, and rendering layers are implemented but automatic live acquisition is not yet end-to-end.

This boundary is intentional: Phase 1 must not silently fall back to Brandfetch, Google favicon endpoints, DuckDuckGo, or another external logo provider.

## Future phases

Later phases may add location-bearing bank descriptors, budget-derived market context, public merchant profiles/social evidence, historical brands, and optional mobile location observations. None of those are prerequisites for Phase 1.
