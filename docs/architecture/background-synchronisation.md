# Milestone 6: Background synchronisation

Budget App starts a replication service after the authoritative persistence provider has initialised.

The service provides:

- an initial replication attempt at startup;
- debounced replication after local persistence notifications;
- a periodic one-minute replication pass while the app is open;
- immediate retry when the browser returns online;
- exponential retry backoff after failures;
- a shared observable status model for UI surfaces;
- manual **Sync now** and checkpoint-upload actions in Settings > About.

Local editing never waits for the network. Replication failures update status and schedule a retry without changing local database authority.

Automatic replication is enabled only when the selected provider exposes the operation journal and replication-store ports. Legacy browser-local-storage and shared-server-authoritative modes remain available but report synchronisation as disabled.
