# Browser runtime removal

The local database is the sole browser persistence runtime.

The former browser localStorage persistence provider and first-run migration
reader have been removed. Application features must obtain persistence through
the configured runtime provider rather than selecting or falling back to a
browser storage backend.

Settings and other application persistence consumers use the active provider's
key/value storage boundary. This prevents application state from being split
between the authoritative local database and an independent localStorage
backend.

The provider factory fails fast when application features are loaded before
startup has configured persistence. This prevents an implicit fallback from
silently selecting a second backend.
