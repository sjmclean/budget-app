# Merchant icon catalogue

The merchant catalogue must be safe to publish and must not be derived from a
developer's or user's personal transaction history.

Allowed catalogue sources are:

- **official** merchant or organisation websites, with reviewed source metadata;
- **community** open-source brand/icon projects with traceable provenance;
- **generated** generic fallback artwork for public merchant identities selected
  from product requirements or broad generic catalogue coverage.

Personal transaction exports, payee histories, bank statements, screenshots,
or private-user merchant lists must not be checked into the repository or used
as catalogue source manifests. Tests and fixtures must use synthetic payees.

Generated fallback marks are not official merchant logos and must not be
described as equivalent to reviewed artwork. Future enrichment may replace an
individual fallback only when its source, provenance, and review state are
recorded accurately.

Run `pnpm merchant-icons:check` after changing the catalogue. Validation
reports reviewed and fallback counts and rejects reviewed entries that point to
generated fallback sprites. Detailed source URLs stay in build-time official
and community manifests; validators cross-check those manifests against compact
runtime provenance rather than shipping audit URLs to the browser.

Automatic matching remains exact and conservative. Region-specific identity
collisions are not resolved by the catalogue without a region hint. Because
payees do not currently persist a region, the application resolver applies the
established Australian application default; callers without a safe default can
pass `merchantRegion: null` and ambiguous identities will fall back to
initials.

## Australian fuel coverage

Fuel/service-station catalogue entries must use official, community, or generic
generated assets only. Personal/user-supplied artwork is not an accepted source
class.
