# Browser runtime removal

The local database is now the sole browser persistence runtime.

Legacy browser localStorage remains readable only through
`legacyBrowserSnapshotReader.ts`, which hydrates the old storage mirror and
exports a canonical snapshot during first-run migration. It is not selectable
as an application backend and it does not expose domain persistence services.

This removes the possibility of accidentally splitting application data between
IndexedDB and localStorage while retaining a non-destructive migration path for
older installations. Global browser preferences that are intentionally outside
the budget database continue to use their existing settings storage.

The provider factory now fails fast when application features are loaded before
startup has configured persistence. This prevents an implicit fallback from
silently selecting a second backend.
