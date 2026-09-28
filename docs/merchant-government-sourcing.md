# Government and public-sector merchant sourcing

The government catalogue is sourced separately from the runtime merchant icon catalogue.

## Why

Government directories can contain thousands of valid organisations, boards, agencies, courts and local bodies. Importing all of them directly as runtime merchants would inflate the picker with low-value identities and generated placeholder art. The source pipeline therefore produces a frozen **candidate inventory** first. A candidate is promoted only when its name/aliases are useful as a transaction payee and acceptable artwork has been reviewed.

## Initial authoritative source families

- Australia: Australian Government Organisations Register (Department of Finance / data.gov.au)
- New Zealand: New Zealand Government A-Z
- United Kingdom: GOV.UK Organisations API
- United States: USAGov agency index

The source registry is designed to grow with state, territory, devolved, regional and local-government adapters. Those sources belong in the candidate layer first; promotion remains artwork-gated.

## Refresh

```bash
pnpm merchant-icons:government:refresh
pnpm merchant-icons:government:candidates
```

Refreshing is deliberately explicit and networked. Normal builds and CI must not depend on live government websites.

Snapshots are written to `tools/merchant-icons/sources/government/`. The normalized candidate inventory is written to `tools/merchant-icons/manifests/government-candidates.json`.

## Runtime promotion rules

A source candidate is not automatically a merchant icon. Promotion requires:

1. a stable jurisdiction-aware key;
2. conservative exact-match names/aliases;
3. an appropriate category;
4. reviewed artwork with build-time provenance;
5. catalogue validation and regression tests.

This keeps source breadth and runtime artwork quality independent.
