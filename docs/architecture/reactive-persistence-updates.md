# Reactive persistence updates

Ordinary remote changes no longer reload the browser document.

The current replication engine publishes batched persistence-change notifications.
React data hooks subscribe through `useSyncExternalStore` and re-read their current
view while preserving route, scroll position, and surrounding component state.

The explicit **Rebuild from server** recovery action may still reload after replacing the complete local database. That is intentionally separate from normal background replication.

The local-first SQLite provider is the sole normal browser runtime. Earlier
provider modes are retained only in historical design/removal records.
