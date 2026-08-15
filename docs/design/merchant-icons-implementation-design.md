# Merchant/payee icon implementation design

**Status:** design only
**Audited baseline:** `f1680c1f6a95080d0e74c797a5ea2e6a4855646b`
**Design branch:** `design/merchant-icons`

This document deliberately distinguishes facts observed at the audited baseline from recommendations and unresolved product decisions. It introduces no production behavior.

## 1. Executive summary

**VERIFIED CURRENT BEHAVIOR**

The canonical payee model already exposes `PayeeView.iconRef?: string`. The browser replicated payee entity projects it as an LWW field, and local-first SQLite has an `icon_ref` column that is read and written. No audited UI renders or edits it, imports do not populate it, and `UpdatePayeeInput` cannot intentionally change it. Most mutation paths preserve it by spreading/copying the existing payee, but the legacy `normalisePayees()` replacement projection omits it, SQLite merge ignores source icons, and the replicated entity merge iterates only the left entity's field keys.

The existing attachment system has a content-hash index and a separate cross-device blob channel, but transaction attachment identifiers, lifecycle, metadata, and local storage semantics are the wrong domain contract for merchant icons. Backup/export does not package binary IndexedDB blobs, and remote blob garbage collection is deferred.

**RECOMMENDED DESIGN**

Canonical payees own icon selection. Retain and formalise `iconRef` as a versioned logical reference for v1:

- absent/empty: automatic;
- `builtin:v1:<key>`: explicitly selected bundled icon;
- `content:v1:<sha256-hex>`: explicitly selected custom raster content.

Introduce one pure resolver and one presentation component, `PayeeIcon`. Resolution happens after canonical payee recognition and never examines raw bank text. Phase 1A should deliver the contract, deterministic initials fallback, curated built-ins, persistence hardening, and Payee Management configuration. Custom upload should follow only after a dedicated merchant-icon content facade, backup policy, and reference lifecycle are implemented over the existing content-addressed blob primitives.

A single scalar `iconRef` can safely use field-level LWW for ordinary concurrent selection. Payee merge needs explicit policy: target explicit icon wins; if target is automatic, inherit a source explicit icon; conflicting explicit icons require a merge-preview choice and default to keeping the target.

**OPEN QUESTION**

Whether custom image upload belongs in the first user-visible release depends on product acceptance of the backup and orphan-blob limitations. The recommended first scope excludes it.

## 2. Current architecture findings with exact evidence

### Payee domain

**VERIFIED CURRENT BEHAVIOR**

- `apps/web/src/features/accounts/payeeService.ts`
  - `PayeeView` includes optional `iconRef`.
  - `UpdatePayeeInput` excludes it.
  - `updatePayee()` and archive/restore paths normally spread the current payee.
  - duplicate-name update and `mergePayees()` build the target from the target payee, preserving the target icon and silently ignoring a source icon.
  - `normalisePayees()` reconstructs payees without `iconRef`; any path that calls `replacePayeeEntities(normalisePayees(...))` can erase the field.
  - transfer labels are excluded from normal canonical payee recording.
- `apps/web/src/features/accounts/entities/payeeEntity.ts`
  - `createPayeeEntity()` writes `iconRef` as a replicated register.
  - `projectPayee()` returns it, defaulting to an empty string.
  - `validFields()` does not require `iconRef`, so older records decode.
  - `mergePayeeEntities()` merges only keys present in entity A. An older A without the new field can drop B's field; a union-of-field-keys merge is required before relying on it.
  - `replacePayeeEntities()` purges and recreates entities from the supplied `PayeeView[]`.
- `payeeRecognition.ts` resolves explicit recognition rules, aliases, and then canonical identity. It returns a canonical payee; it has no icon behavior.
- `merchantKnowledge.ts`, `merchantKnowledgeService.ts`, and `merchantNormalisation.ts` maintain observational name/category/account evidence and suggestions. They contain no authoritative icon field.
- `payeePersistencePort.ts` exposes CRUD/merge around `PayeeView` and `UpdatePayeeInput`.

### Payee Management

**VERIFIED CURRENT BEHAVIOR**

`PayeeManagementPage.tsx` owns search, selection, edit, archive/delete, duplicate review, rename/alias/rule dialogs, and multi-step merge. It renders payee names and counts but no `iconRef`. Save operations construct an update containing name, note, default category, aliases, and rules. Dialogs use the existing application dialog service and page-local modal state.

### Register and selectors

**VERIFIED CURRENT BEHAVIOR**

- `AccountRegisterPage.tsx` renders textual payee values; icons are not a separate column and no payee icon resolver exists.
- `PayeeInput.tsx` and `registerPayeeAutocomplete.ts` receive `PayeeView[]`, but autocomplete metadata carries only IDs, labels, type, recency, and use count. Transfers use a textual arrow.
- `ScheduledTransactionsPanel.tsx` uses plain text/datalist payee rendering and already stores an optional canonical `payeeId`.
- No audited surface uses `iconRef`.

### Existing icon infrastructure

**VERIFIED CURRENT BEHAVIOR**

`CategoryIcon.tsx` is a category-name heuristic returning inline SVG paths and colour classes. Tag icons are similarly code-native. This is useful styling precedent but not a merchant resolver: applying category-name heuristics to payees would create the prohibited second recognition system. Lucide-style code-native icons are suitable for generic fallbacks, transfers, upload controls, and status—not merchant branding.

### Local-first SQLite

**VERIFIED CURRENT BEHAVIOR**

- `registerSchema.ts` defines `local_payees.icon_ref TEXT` and `LocalPayeeRecord.iconRef?`.
- `localPayeeView.ts` maps SQLite rows to `PayeeView.iconRef`.
- `localBudget.worker.ts` adds `icon_ref` to older databases, reads it in payee queries, writes it in local payee mutation/upsert flows, and includes it in replicated mutation payloads.
- The bulk import upsert around the audited import path omits `icon_ref` from its column list. Imports currently do not supply icons, so the desired outcome is automatic/fallback, but future compatible icon import would require an explicit audited path.
- SQLite `mergePayees()` resolves default-category inheritance and references, but does not resolve source `icon_ref`; target survives, source is deleted or archived.

### Replication and attachments

**VERIFIED CURRENT BEHAVIOR**

Payee entity/record metadata travels through the existing operation journal and checkpoints. Attachment binary content deliberately does not. `replicationEngine.ts` uploads local attachment blobs before metadata operations, then downloads missing referenced hashes after pull. `replicationStore.mjs` stores immutable bytes by SHA-256, with budget/generation metadata and reference-safe physical deletion across budgets. The architecture document explicitly defers remote garbage collection and encryption.

## 3. Existing `iconRef` findings

**VERIFIED CURRENT BEHAVIOR**

| Question | Finding |
|---|---|
| Populated where? | Entity creation/projection and SQLite payee upserts can carry it; current creation/import/UI paths do not select one. |
| Read where? | Payee entity projection and canonical SQLite row-to-`PayeeView` mapping. |
| Used by UI? | No audited UI use. |
| Imports populate it? | YNAB4 mapping does not; no compatible Actual icon mapping was found in scope. |
| Rename preserves it? | Normal spread/copy paths do; collision merge keeps target only. |
| Ordinary update preserves it? | SQLite client copies current value and most browser updates spread current; legacy normalization/replacement can erase it. |
| Merge behavior? | Target value survives; source value is silently discarded. |
| Replacement behavior? | Safe only if every supplied `PayeeView` carries the value; normalization currently omits it. |
| Old record safety? | Optional validation and projection fallback make old records readable. |
| LWW? | Browser replicated payee entity stores it as an LWW register. |

**RECOMMENDED DESIGN**

Before exposing icon editing, add invariants that every payee mapper and replacement path round-trips the field, extend update semantics, harden entity merging to a union of fields, and define merge conflict behavior.

## 4. Recommended ownership model

**RECOMMENDED DESIGN**

The canonical `PayeeView`/payee identity owns icon selection because transactions, scheduled transactions, aliases, recognition rules, and imports already converge on `payeeId`. Raw descriptions remain evidence/provenance. MerchantKnowledge may help choose a canonical payee, but cannot own or overwrite presentation chosen for that payee.

Transfers are not merchant payees. They resolve to a dedicated transfer glyph using transfer/account semantics.

## 5. Recommended persisted schema

**RECOMMENDED DESIGN — option A**

Keep `iconRef` as the persisted contract and formalise its grammar:

```text
"" | undefined                  automatic
builtin:v1:<stable-key>         explicit bundled choice
content:v1:<64-lower-hex>       explicit custom SHA-256 content
```

Use a parser returning a typed runtime `PayeeIconSelection`; do not scatter prefix parsing. Reject unknown or malformed explicit references on writes and degrade them to fallback on reads.

Why A, not a richer object or separate entity:

- the scalar is already in browser entities and SQLite;
- one user choice has natural field-level LWW semantics;
- no migration is required for automatic state;
- it minimizes codecs/server/schema changes;
- richer metadata can be derived from a content descriptor keyed by hash.

A separate replicated asset metadata entity becomes justified only if future requirements include crop/focal data, attribution/licensing, external-provider provenance, multiple variants, or independent sharing/lifecycle.

**OPEN QUESTION**

If product requires explicit persisted distinction between “automatic” and “user deliberately reset to automatic,” empty remains sufficient for rendering but not audit history. A richer entity would then be warranted.

## 6. Backward compatibility

**RECOMMENDED DESIGN**

- Missing/empty `iconRef` means automatic.
- Older clients ignore the optional field.
- Readers must never fail on unknown future prefixes; render deterministic fallback.
- Entity validation remains optional but should validate recognized strings when present.
- Entity merge must union field keys so old/new client records converge.
- SQLite's nullable column already supports the contract.
- Persistence audits must record every new/changed mapper even without a schema-version migration.

## 7. Resolver precedence

**RECOMMENDED DESIGN**

1. valid explicit custom content reference;
2. valid explicit bundled reference;
3. a known automatic merchant icon attached through explicit canonical metadata/registry;
4. deterministic initials/avatar fallback.

If custom metadata exists but bytes are unavailable, show fallback with no broken-image UI and retry content resolution outside render.

The resolver accepts canonical payee data only. It never parses `rawPayee`, transaction memo, or arbitrary imported descriptions.

## 8. Built-in and fallback strategy

**RECOMMENDED DESIGN**

- Bundle a small code-reviewed icon catalogue keyed by stable, non-localized keys.
- Built-ins include generic merchant types and transfer/no-payee states; merchant logos require separate licensing/product approval.
- Automatic merchant keys must be assigned only by explicit canonical configuration or a future curated exact registry, never fuzzy name matching.
- Fallback: normalize canonical display name only for initials, choose colour from a stable hash of canonical payee ID, and expose the payee name to assistive technology.
- Unknown payees and missing assets always fall back.
- “No payee” gets a neutral glyph; transfers get the transfer glyph.

## 9. Custom asset-storage assessment

**VERIFIED CURRENT BEHAVIOR**

`BrowserIndexedDbAttachmentContentStore` uses a configured namespace, records `attachmentId`, device-local `contentRef`, MIME, size, hash, and Blob. Namespacing is configured externally and is not inherently budget ownership in the store contract. Hash lookup supports deduplication, but `put()` addresses the record by attachment ID. SQLite transaction attachments currently store content BLOBs up to 5 MiB; the older IndexedDB/replication architecture stores metadata separately and syncs hashes through the blob channel.

The JSON/key-value budget export gathers scoped records and entity records; it does not package IndexedDB blob bytes. The attachment replication design confirms cross-device binary sync, but remote GC is deferred.

**RECOMMENDED DESIGN**

Do not use fake transaction attachment IDs. Introduce `MerchantIconContentStore` as a domain facade using shared lower-level hash/read/write/blob-replication primitives. Make budget ID explicit in metadata and authorization. Use content hashes for safe sharing; local deletion must reference-count or reachability-check before removing shared content. A dangling content reference is permitted operationally but must render fallback and surface diagnostics.

**Answer:** current primitives are reusable; the transaction attachment store contract is not directly suitable. Custom icons would sync only after their references are included in the replication engine’s referenced-blob enumeration and upload/download flow. Merely writing `content:v1:...` into a payee will not make bytes sync.

## 10. Sync semantics

**RECOMMENDED DESIGN**

- Offline edit writes one payee icon selection and journal mutation.
- Remote metadata uses existing field-level LWW; the winning scalar determines selection.
- Concurrent selections converge by the existing register clock. Binary hashes are immutable, so content does not conflict.
- Rename leaves `iconRef` untouched.
- Archive preserves it.
- Delete removes payee metadata; content is eligible for GC only after no live payee, retained checkpoint, or budget references it.
- Restore/reopen reads the same selection and falls back if bytes are pending.
- Replacement/import must preserve existing icon only when replacing the same canonical payee identity by policy; fresh imported identities start automatic.
- Older clients lacking the field remain compatible; union-key entity merge is required.

## 11. Payee rename, update, and merge semantics

**RECOMMENDED DESIGN**

Extend write input with an unambiguous patch, not a nullable optional that conflates “unchanged” and “reset”:

```ts
type PayeeIconPatch =
  | { action: "unchanged" }
  | { action: "set"; iconRef: string }
  | { action: "reset-automatic" };
```

A dedicated `updatePayeeIcon` command is also acceptable if it reuses the canonical payee mutation pipeline.

Merge rule across duplicate-name update, rename collision, and explicit merge:

1. target explicit + source anything: target wins;
2. target automatic + exactly one source explicit: inherit source;
3. target automatic + multiple identical source explicit refs: inherit it;
4. conflicting explicit refs: merge preview requires choice; default is keep target;
5. all automatic: remain automatic.

Cases:
- A: no-icon target inherits Woolworths custom icon.
- B: conflicting A/B prompts, target selected by default; never silently delete the only user-visible choice.
- C: target explicit wins over source built-in/automatic.
- D: target remains automatic.

The decision and any content-retention effect should be included in merge preview/history.

## 12. Import boundary

**RECOMMENDED DESIGN**

YNAB4, Actual Budget, bank imports, and alias imports do not invent icons. Fresh payees use automatic/fallback. No icon operation changes `rawPayee`, provenance, aliases, matching, amounts, categories, or reference identity. If a future source exposes a compatible icon, support requires separate mapping, trust/safety policy, and tests.

Existing payee replacement must be hardened not to erase icons on already-owned canonical identities; this is distinct from assigning icons to imported payees.

## 13. MerchantKnowledge boundary

**RECOMMENDED DESIGN**

MerchantKnowledge remains observational. It may participate upstream in existing canonical resolution and may someday hold a non-authoritative hint key. It must never overwrite an explicit payee selection, initiate online lookup, or affect financial/import matching. The icon resolver consumes the resolved canonical payee, not MerchantKnowledge evidence.

## 14. Payee Management UX

**RECOMMENDED DESIGN**

- Payee list rows: 32 px icon, payee name/count beside it.
- Selected detail identity: 48–64 px preview with a “Change icon” button; clicking the icon may invoke the same accessible button.
- Existing compact dialog pattern:
  - Automatic;
  - Built-in grid/list;
  - Upload custom image (only in custom-content phase);
  - Revert to automatic.
- The dialog owns a temporary draft. Save persists once; Cancel changes nothing.
- Keyboard: labelled button, focus trapped in dialog, arrows/tab navigate choices, Escape cancels, Enter selects without bypassing Save.
- Preview alt semantics: decorative beside visible name; picker choices have accessible names.
- Validation errors remain in dialog and do not clear current selection.
- No separate administration page.

## 15. Register UX

**RECOMMENDED DESIGN**

Render `[20px PayeeIcon] [payee name]` within the existing payee cell, 8 px gap, preserving row height. No column. Repeat payees reuse resolution/cache.

- editing: keep icon visible immediately left of editor when canonical `payeeId` exists; otherwise neutral fallback;
- split parent rows use the transaction’s canonical payee;
- transfer rows use transfer glyph;
- pending/import review uses icon only after canonical identity is resolved;
- no payee uses neutral placeholder;
- narrow layout may use 18 px but never hide the payee text.

Register rollout follows resolver and Payee Management proof.

## 16. Selector/autocomplete UX

**VERIFIED CURRENT BEHAVIOR**

Selectors are not unified: `PayeeInput` uses a custom autocomplete; scheduled entry uses a datalist; mobile/editor flows have additional presentation. Autocomplete metadata already carries canonical payee ID.

**RECOMMENDED DESIGN**

Extend shared autocomplete option metadata with a resolved icon descriptor and introduce a shared `PayeeOptionContent` renderer where custom markup is possible. Native datalist cannot reliably render icons; replace it only in the later selector phase, not as part of domain work. Transfers remain a separate option type.

## 17. Component/API design

**RECOMMENDED DESIGN**

```ts
type ResolvedPayeeIcon =
  | { kind: "builtin"; key: string }
  | { kind: "custom"; contentHash: string; objectUrl?: string }
  | { kind: "initials"; initials: string; colourToken: string }
  | { kind: "transfer" }
  | { kind: "none" };

resolvePayeeIcon(payee: Pick<PayeeView, "id" | "name" | "iconRef">, assets): ResolvedPayeeIcon

<PayeeIcon payee={payee} resolved={resolved} size="sm" decorative />
```

A provider/hook loads asset descriptors once per budget and caches object URLs by hash. `PayeeIcon` performs no payee fetch, network call, recognition, raw-string parsing, or mutation.

## 18. Performance considerations

**RECOMMENDED DESIGN**

- Build a payee-ID-to-resolved-descriptor map when payees/assets change.
- No storage or network read per row.
- Cache one decoded/object URL per content hash, with reference-counted revocation on budget switch, asset change, and unmount.
- Lazy decode custom assets, constrained dimensions.
- Repeated payees share descriptor and URL.
- Avoid embedding data URLs in payee entities/checkpoints.
- Risks are excessive distinct custom images, decode bursts, leaked object URLs, and rerendering every register row after one change; mitigate with memoized components and targeted maps.

## 19. Security and image validation

**RECOMMENDED DESIGN**

For a future upload phase:

- accept PNG, JPEG, and WebP only;
- reject arbitrary SVG in v1 rather than attempting incomplete sanitization;
- maximum 512 KiB after processing, maximum decoded input 5 MiB;
- maximum source dimensions 2048×2048, output normalized to at most 256×256;
- decode in a safe browser image pipeline, rasterize/re-encode, stripping EXIF and ancillary metadata;
- reject MIME/signature mismatch, decode failure, animated formats, and decompression-bomb dimensions;
- revoke temporary object URLs on replace/cancel/unmount;
- never insert uploaded markup into DOM;
- hash normalized output bytes.

**OPEN QUESTION**

Product must approve limits and whether transparency/WebP is required.

## 20. Future external-logo extension point

**RECOMMENDED DESIGN**

Define an optional `AutomaticPayeeIconProvider` returning cached descriptors from explicit persisted merchant-domain metadata. It is disabled by default, never called during row render/import/entry, tolerates failure, and falls back offline. Domain should be explicitly verified/persisted rather than inferred repeatedly from names.

A global privacy preference such as “Allow online logo lookup” belongs in the replicated/global settings infrastructure only when this phase exists. “Show merchant icons” is not needed for v1 unless product requires a universal visibility toggle.

## 21. Persistence-impact matrix

| Boundary | Phase 1A | Custom phase |
|---|---|---|
| `PayeeView.iconRef` | Formalize; retain | Same |
| `UpdatePayeeInput`/commands | Extend safely | Same |
| Browser payee entity | Validation + union-key merge tests; no new field | Same |
| SQLite `local_payees` | No new column; mapper/merge hardening | Same |
| Migration | No schema migration expected | Asset metadata may require schema/entity |
| Codec/persistence audit | Update validation and audit references | Add asset references |
| Replication operations | Existing scalar metadata | Extend referenced-blob enumeration |
| Server | None | Blob channel may be generalized; authorization/GC policy |
| Backup/export | Icon ref included through payee entity after mapper fix | Must package bytes or clearly declare metadata-only backup unacceptable |
| YNAB4/Actual import | Explicit automatic/no invention | Same |
| Staged import | Preserve/initialize empty | Same |
| Attachment system | None | Share primitives, not transaction semantics |

## 22. Detailed test plan

**Domain**
- deterministic fallback and stable colour/initials;
- explicit custom/builtin precedence;
- malformed/missing content falls back;
- transfers never get merchant branding;
- unknown/no-payee safe.

**Payee persistence**
- entity and SQLite round-trip;
- old entity without field reads;
- normal update, rename, archive/restore preserve;
- normalization/replacement preserves;
- entity merge unions fields;
- all merge precedence cases, including explicit conflict choice.

**Sync**
- concurrent LWW selection convergence;
- metadata survives operation/checkpoint replication;
- metadata-before-content fallback then recovery;
- old/new client merge compatibility.

**Custom content**
- MIME/signature/size/dimension validation;
- normalized hash integrity and deduplication;
- shared hash deletion safety;
- dangling reference fallback;
- budget authorization and lifecycle;
- backup/restore and cross-device blob delivery.

**UI**
- accessible Change icon and picker;
- draft preview, Save, Cancel, validation error;
- list/register/selectors display same resolver result;
- object URL cleanup;
- no raw imported description owns an icon.

**Import regression**
- YNAB4, Actual, and bank imports leave icon automatic when absent;
- raw payee/provenance/matching/financial fields unchanged;
- existing canonical payee icon survives import-related updates/replacement.

**Performance**
- mocked store confirms no per-row reads;
- many rows/repeated payees share one resolved descriptor/object URL.

## 23. Phased implementation plan

1. **Phase 1A — safe offline foundation:** formalize `iconRef`, parser/resolver, deterministic fallback, curated generic built-ins, persistence/merge/replacement hardening, tests and audit updates.
2. **Phase 2 — Payee Management:** preview/picker for Automatic and built-ins; no custom upload unless approved storage work is included.
3. **Phase 2B — custom content (separate approval):** dedicated merchant icon facade, normalization/security, replication reference enumeration, backup/restore, lifecycle.
4. **Phase 3 — register and selectors:** shared component/renderer, scheduled/mobile surfaces, performance tests.
5. **Phase 4 — optional external lookup:** provider abstraction, explicit domain metadata, privacy setting, cache.

## 24. Expected files likely to change per phase

**Phase 1A**
- `apps/web/src/features/accounts/payeeService.ts`
- `apps/web/src/features/accounts/entities/payeeEntity.ts`
- `apps/web/src/features/persistence/localFirst/localPayeeView.ts`
- `apps/web/src/features/persistence/localFirst/localBudget.worker.ts`
- new `apps/web/src/features/icons/payeeIconReference.ts`
- new `apps/web/src/features/icons/payeeIconResolver.ts`
- payee entity/service/local-first/persistence audit tests.

**Phase 2**
- `apps/web/src/pages/PayeeManagementPage.tsx`
- `apps/web/src/styles/globals.css`
- new `PayeeIcon.tsx` and picker/dialog components
- Payee Management tests.

**Phase 2B**
- new merchant icon content facade/store and metadata/reference code
- attachment/blob replication engine and referenced-hash scanner
- backup/export/restore
- potentially server blob naming/messages (not necessarily schema)
- security, replication, backup, GC tests.

**Phase 3**
- `AccountRegisterPage.tsx`
- `PayeeInput.tsx`
- `registerPayeeAutocomplete.ts`
- `ScheduledTransactionsPanel.tsx`
- mobile/editor surfaces and CSS/tests.

**Phase 4**
- provider/cache/domain metadata and settings files, with separate privacy review.

## 25. Open questions requiring product approval

1. Is v1 built-in/fallback only, as recommended, or must it include custom uploads?
2. Are generic pictograms sufficient, or are licensed merchant logos required later?
3. Should a conflicting explicit icon merge always prompt, or can target-always-wins be accepted?
4. Are 512 KiB normalized/256 px output limits acceptable?
5. Must budget backup be fully self-contained for custom icons before release?
6. Is a global “Show merchant icons” toggle desired?
7. Would future online lookup be opt-in or opt-out, and what explicit domain source is trusted?
8. Should multiple payees be allowed to share custom content by hash across budgets, subject to authorization?

## 26. Risks

- Existing normalization/replacement silently dropping `iconRef`.
- Asymmetric replicated entity merge losing fields from newer clients.
- SQLite and browser merge implementations diverging.
- Metadata syncing before bytes and displaying broken images.
- Backup restoring dangling refs.
- Custom assets leaking memory through object URLs.
- Unsafe SVG/image bombs.
- Silent loss of custom source icon during merge.
- Accidental fuzzy recognition based on raw descriptions.
- Licensed/logo privacy issues in a future network phase.
- Premature blob deletion while retained checkpoints/devices still reference it.

## 27. Recommended Phase 1 scope

**RECOMMENDED DESIGN**

Approve Phase 1A only:

- retain/formalize scalar `iconRef`;
- implement typed parser and pure offline resolver;
- deterministic initials/avatar fallback;
- small generic built-in catalogue;
- preserve and safely update icon selection across all payee mutation/replacement paths;
- define/test merge policy;
- render/configure it first in Payee Management;
- no custom uploads, external lookups, merchant logo bundle, import matching changes, or register integration.

This scope proves ownership, persistence, sync convergence, and UX without coupling the feature to unresolved binary backup/lifecycle work.
