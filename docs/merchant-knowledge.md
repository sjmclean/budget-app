# Merchant Knowledge

## Status

Foundation implemented in:

```text
apps/web/src/features/accounts/merchantKnowledge.ts
```

The current implementation is an internal, browser-persisted foundation. It is not yet the final repository-backed cross-client storage model, and there is intentionally no Merchant Manager UI yet.

## Purpose

Merchant Knowledge is the application-wide source of merchant identity and observed merchant behaviour.

It replaces the idea that aliases belong only to the transaction importer. Import, register editing, manual transaction entry, reporting, and future mobile clients should all use and contribute to the same knowledge.

At the transaction level, the UI may continue to use the familiar term **Payee**. Internally:

```text
Transaction payee value
  -> resolves to a canonical merchant
  -> Merchant Knowledge stores what the application has observed
```

## Core principles

### Store evidence, not confidence

Persist objective facts:

- occurrence counts
- first-seen and last-seen timestamps
- category usage
- account usage
- transfer-account usage
- raw aliases and preferred names

Do not persist confidence percentages or opaque recommendations. Confidence-like decisions are derived at runtime from the evidence.

### Identity and intent are different

Changing:

```text
ALDI 123 -> Aldi
```

is an identity correction. The application may offer to rename matching historical transactions because they refer to the same merchant.

Changing a transaction category to `Groceries` is a budgeting decision. It should contribute evidence for future categorisation, but must not automatically rewrite historical categories.

### Learning should be quiet

Merchant Knowledge should normally improve the experience without profile pickers, save-rule prompts, or a mandatory management screen.

The user should interact with their data:

- correct a payee
- choose a category
- resolve a transfer

The application records confirmed evidence behind those actions.

## Current data model

### MerchantKnowledgeRecord

A canonical merchant currently contains:

- `id`
- `preferredName`
- `normalisedName`
- `occurrenceCount`
- `firstSeenAt`
- `lastSeenAt`
- `aliases`
- `categoryUsage`
- `accountUsage`
- `transferUsage`

### Alias evidence

Each alias stores:

- raw source value
- normalised source value
- occurrence count
- first-seen timestamp
- last-seen timestamp

Example:

```text
Merchant: Aldi
Preferred name: Aldi
Aliases:
  ALDI 123       12 observations
  ALDI STORE 45   8 observations
```

### Category evidence

Each category relationship stores:

- category ID when available
- category name
- occurrence count
- first-used timestamp
- last-used timestamp

The current derivation rule selects the highest occurrence count, with most recent use as a deterministic tie-breaker.

### Account evidence

Each merchant/account relationship stores occurrence count and first/last use. This is evidence about where a merchant appears; it is not a hard rule that restricts the merchant to an account.

### Transfer evidence

Transfer usage records the destination account observed for a merchant-like transfer payee. The most-used transfer account can later be offered or applied where the evidence is sufficiently dominant.

## Identity resolution

Merchant lookup currently normalises the supplied value and checks:

1. canonical normalised merchant name
2. normalised alias values

The normalisation algorithm remains a shared implementation detail and should not be reimplemented independently in the importer, register, or reports.

## Derivation rules

### Preferred category

Current baseline:

```text
highest occurrence count
  -> if tied, most recently used
  -> if no evidence, no derived category
```

A future consumer may require a dominance threshold before automatically applying the category. For example, `Groceries: 480` versus `Christmas: 2` is strong evidence, while `Groceries: 42` versus `Household: 39` is ambiguous.

Any threshold is runtime policy. It must not be stored as confidence in the merchant record.

### Preferred transfer account

Current baseline uses the same evidence ordering:

```text
highest occurrence count
  -> if tied, most recently used
```

### Preferred name

A preferred name is an explicit canonical identity, generally established by a confirmed rename or alias action. Future imports and entry workflows should use it automatically after resolving a raw alias.

## Contribution points

### Import Engine

The importer may:

- resolve raw payees through Merchant Knowledge
- apply a derived category where evidence is clear
- apply a derived transfer account where evidence is clear
- record alias evidence after a confirmed payee correction
- record category/account/transfer evidence after the transaction is committed

The importer should not own a second alias database long term. Existing compatibility alias storage should be migrated or adapted to Merchant Knowledge incrementally.

### Register Engine

Register workflows should contribute evidence after successful transaction creation or editing.

Examples:

- new transaction with merchant and category
- payee rename
- transfer destination correction
- bulk payee cleanup

Evidence should be recorded only after the underlying register operation succeeds.

### Manual transaction entry

Entry may use Merchant Knowledge to:

- resolve aliases while typing/selecting a payee
- suggest or prefill a strongly supported category
- resolve common transfer destinations

### Reporting

Merchant reports should group aliases under canonical identity. Reports must not invent their own merchant normalisation rules.

## Historical cleanup policy

When a user changes a raw payee to a preferred merchant name and matching historical transactions exist, the application should ask whether to rename those existing transactions.

The confirmation should state the scope and affected count. If approved, the cleanup and preferred-name/alias update should be coordinated so the register and future knowledge remain consistent.

This policy applies to identity cleanup only. Historical categories must remain unchanged unless the user explicitly initiates a separate bulk category operation.

## Persistence roadmap

The current local-storage key is:

```text
budget-app.merchant-knowledge.v1
```

This is suitable for the foundation but not the final portable-budget architecture. Merchant Knowledge should eventually move behind repository/application-service boundaries and live inside the budget package so that it:

- travels with the budget
- participates in backup and restore
- is available across desktop/mobile clients
- can be included in sync and conflict handling
- remains isolated between budgets

Migration must preserve existing local evidence where possible.

## Payee management relationship

Merchant Knowledge is intended to become the foundation of future payee management.

The UI may still be called **Payee Management** because that term is familiar. Its canonical operations would be backed by Merchant Knowledge:

- rename preferred merchant
- merge merchants
- inspect aliases
- clean up historical payee values
- optionally set an explicit category default in the future
- view category and account usage evidence

A management screen is deferred until the model has been exercised through import and register workflows.

## Non-goals for the foundation

- No stored confidence scores.
- No user-managed importer profiles.
- No automatic historical recategorisation.
- No separate importer-owned merchant rule engine.
- No mandatory Merchant Manager UI.
- No fuzzy bulk rename without explicit confirmation.

## Future extensions

Potential extensions that fit the current boundary:

- merchant merge lineage
- explicit default category overriding observed usage
- stronger dominance policies for automatic categorisation
- repository-backed persistence
- migration of legacy payee aliases
- register-wide cleanup commands
- audit/undo integration for merchant merges and historical renames
