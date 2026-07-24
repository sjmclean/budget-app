# Reactive persistence updates

Ordinary remote changes no longer reload the browser document.

Both the legacy shared-server watcher and the current replication engine publish a batched persistence-change notification. React data hooks subscribe through `useSyncExternalStore` and re-read their current view while preserving route, scroll position, and surrounding component state.

The explicit **Rebuild from server** recovery action may still reload after replacing the complete local database. That is intentionally separate from normal background replication.

The current deployment target remains `local-database`, which is the default. `shared-server` remains temporarily available only to support migration and will be removed after deployments have been verified on the local-first provider.
