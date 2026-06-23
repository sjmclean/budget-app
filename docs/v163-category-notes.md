# v1.63 Category and Category Group Notes

## Purpose

v1.63 adds the missing note representation needed before full-fidelity YNAB4 import writes begin.

YNAB4 can store notes on both:

- individual categories / subcategories
- category headers / master categories

The app already had individual `CategorySettings.notes`, but category groups did not have an equivalent settings/notes model. This meant YNAB4 category-header notes had nowhere safe to land.

## What Changed

### Browser Budget UI

The budget inspector now supports:

- individual category notes
- category group notes

Notes are edited in the selected category inspector and persist with the browser budget view data.

The budget table also shows a small note badge when a category or category group has notes.

### Core Model Foundation

Added a category group settings model:

- `CategoryGroupSettings`
- `category_group_settings` SQLite table
- `CategoryGroupSettingsRepository`
- `SqliteCategoryGroupSettingsRepository`
- `createCategoryGroupSettings`

This mirrors the existing category settings model and gives YNAB4 category header/master-category notes a durable schema target.

## YNAB4 Import Impact

This removes the first critical representation blocker from the v1.62 audit:

- YNAB4 category notes can map to `CategorySettings.notes`.
- YNAB4 category group/header notes can map to `CategoryGroupSettings.notes`.

Actual YNAB4 import writes are still not implemented in this release.

## Not Included

v1.63 does not implement:

- YNAB4 import writes
- category goals
- monthly category notes
- note search
- rich text formatting
- category group management UI beyond note editing in the inspector

## Test Command

```bash
pnpm test:v163
```

## Build Verification

```bash
pnpm --filter @budget-app/web build
```
