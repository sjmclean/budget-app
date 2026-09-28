# Merchant icon catalogue

The live catalogue contains deliberately different asset tiers:

- **110 reviewed merchant artworks** from the original user-supplied catalogue. These retain
  `provenance.kind: "user-supplied"` and `reviewed: true`.
- **313 reviewed official-site assets** use icons fetched from the merchant or organisation's own
  website. The sourcing manifest records both the homepage and exact asset URL, with runtime
  `provenance.kind: "official"`.
- **88 reviewed community artworks** come from named, traceable open-source brand-icon projects.
  These are recognizable community-maintained marks, not claims of official endorsement, and use
  `provenance.kind: "community"`.
- **258 generated identity fallbacks** remain category-coloured, first-letter tiles. They make the
  merchant identities live and searchable without pretending to be official trademarks. They keep
  `provenance.kind: "generated"` and `reviewed: false` until legitimate artwork is sourced and reviewed.

Together, 511 of 769 live entries have reviewed artwork. The other 258 identities remain usable but
visibly and programmatically distinct fallbacks.

Generated fallback marks are not official merchant logos and must not be described as equivalent
to the reviewed artwork. Future enrichment may replace an individual fallback only when its source,
provenance, and review state are recorded accurately.

Run `pnpm merchant-icons:check` after changing the catalogue. Validation reports reviewed and
fallback counts and rejects any reviewed entry that points back to a generated fallback sprite.
Detailed source URLs stay in build-time official and community manifests; validators cross-check
those manifests against compact runtime provenance rather than shipping audit URLs to the browser.

Automatic matching remains exact and conservative. Region-specific identity collisions are not
resolved by the catalogue without a region hint. Because payees do not currently persist a region,
the application resolver applies the established Australian application default; callers without a
safe default can pass `merchantRegion: null` and ambiguous identities will fall back to initials.


## Australian fuel coverage

The live catalogue includes fuel/service-station identities for 7-Eleven, APCO, Caltex, Coles Express, United Petroleum, BP, Ampol, Shell, Mobil, Metro Petroleum, OTR, Reddy Express, Pearl Energy, X Convenience and EG Ampol. BP, Ampol, Shell, Mobil, Metro Petroleum, OTR, Reddy Express and Pearl Energy use traced reviewed community artwork; X Convenience and EG Ampol remain explicit generated fallbacks pending reviewed artwork. The broken Anaconda sprite payload is replaced by a standalone validated PNG derived from the original user-supplied artwork.
