# YNAB4 payee knowledge migration

## End-to-end audit

YNAB4 payees enter through the bounded `Ynab4JsonSourceReader` reference-data
collection. `ynab4LauncherImport.ts` is the canonical mapper. The local-first
destination then writes the mapped payees through `SqliteImportPayee` into the
existing normalized `local_payees` and `local_payee_recognition_rules` tables.
Runtime payee administration, bank-import recognition, manual transaction entry,
merge, synchronization, baseline backup and restore all read those same tables.
No parallel YNAB4-only knowledge store is introduced.

Before this change the mapper retained only payee ID and name, and the staged
import explicitly reduced those records to ID/name again. Consequently
`autoFillCategoryId` and `renameConditions` never reached either payee domain.

## Mapping decisions

- `autoFillCategoryId` is resolved through the stable source-category ID map.
  The imported payee receives the existing `defaultCategoryId` and
  `defaultCategoryName` fields.
- `Category/__ImmediateIncome__` and `Category/__DeferredIncome__` both map to
  Budget App's single semantic `Ready to Assign` category. Budget App does not
  have separate current/next-month income categories.
- An unresolved category reference is not matched by display name. It produces
  an `unresolved-default-category` diagnostic and leaves the default empty.
- Active YNAB4 `Is` conditions become exact (`equals`) rules. Active `Contains`
  conditions become `contains` rules. The source operand text is preserved.
- Tombstoned conditions are counted but never activated. Unsupported operators,
  missing targets, and rules claimed by multiple payees are disabled with
  structured diagnostics.
- Duplicate conditions for the same target are deterministically deduplicated.
- `enabled: false` is the YNAB4 "List and autocomplete this payee" state. It maps
  to the existing archived payee state, which retains the record for management
  while excluding it from normal entry suggestions.
- `autoFillMemo` and `autoFillAmount` remain deliberately out of scope.

## Runtime precedence and invariants

Bank import recognition already evaluates aliases and deterministic rules before
merchant learning. Its category choice is: explicit imported category, rule
category, recognized payee default, merchant learning, then uncategorized.
Historical transaction categories are mapped independently and are never
rewritten from a payee default.

Manual entry applies a selected payee default only while the category is empty or
uncategorized; it does not overwrite a category the user selected explicitly.

Merge keeps a survivor default. If the survivor has no default, one distinct
source default may fill it. Multiple conflicting source defaults leave the
survivor empty for explicit review. Recognition rules and exact source names use
the existing redirect/alias merge path. Keep Separate does not mutate knowledge.

## Reconciliation

Every plan exposes `payeeKnowledgeAudit` with exact counters for source/imported/
special/unresolved defaults and total/active/tombstoned/imported/deduplicated/
conflicting/unsupported/unresolved rename conditions. Diagnostics include source
payee and condition IDs where available and are also surfaced as import warnings.

The local staged write is transactional. Payee metadata and normalized rules are
part of the SQLite baseline, so the existing baseline export/replacement and
backup/restore mechanisms preserve them without a special restore path.
