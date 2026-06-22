# v1.44 Settings Foundation

## Summary

v1.44 replaces the placeholder Settings page with a section-based settings foundation.

The release exposes the existing settings direction without moving payee/category management into Settings. Settings remains focused on global app and budget preferences.

## Sections

- General
  - Theme
  - Date format
  - Number format
  - First day of week
  - Language
- Budget
  - Budget name / rename
  - Currency
  - Currency symbol
  - Decimal places
  - Future month budgeting limit
- Data
  - Export placeholder
  - Backup placeholder
  - Restore placeholder
- Cloud
  - Future cloud sync placeholder
- About
  - App version
  - Release
  - Persistence mode

## Behaviour

Settings are stored in browser-safe key/value storage under `budget-app.settings.v1`.

Budget name and currency code are applied to the budget view so the Settings page can rename the current budget and influence displayed currency without introducing reset/delete behaviour yet.

## Deliberately Not Included

- Reset budget
- Delete budget
- Delete all app data
- Default category template provisioning
- Payee/category management relocation

Those items require a separate data-management/default-category release.
