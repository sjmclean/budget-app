# Merchant icon catalogue

The live catalogue contains two deliberately different asset tiers:

- **110 reviewed merchant artworks** from the original user-supplied catalogue. These retain
  `provenance.kind: "user-supplied"` and `reviewed: true`.
- **650 generated identity fallbacks** from the major expansion. These are category-coloured,
  first-letter tiles. They make the merchant identities live and searchable without pretending
  to be official trademarks. They retain `provenance.kind: "generated"` and `reviewed: false`
  until legitimate artwork is sourced and reviewed.

Generated fallback marks are not official merchant logos and must not be described as equivalent
to the reviewed artwork. Future enrichment may replace an individual fallback only when its source,
provenance, and review state are recorded accurately.

Automatic matching remains exact and conservative. Region-specific identity collisions are not
resolved by the catalogue without a region hint. Because payees do not currently persist a region,
the application resolver applies the established Australian application default; callers without a
safe default can pass `merchantRegion: null` and ambiguous identities will fall back to initials.

