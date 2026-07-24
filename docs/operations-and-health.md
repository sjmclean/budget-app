# Server operations and health

Budget App exposes separate liveness and readiness endpoints.

- `GET /api/health` proves the Node process is serving requests. It returns service identity, uptime, server time, and replication protocol version.
- `GET /api/ready` verifies SQLite access, the active replication generation, and read/write access to the data and blob directories.

Filesystem paths are hidden by default. Set `BUDGET_APP_EXPOSE_PATHS=true` only for trusted diagnostic environments.

## Runtime configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Listen address |
| `PORT` | `3000` | Listen port, validated from 1–65535 |
| `BUDGET_APP_DATA_DIR` | `apps/server/data` | Durable server data directory |
| `BUDGET_APP_DATABASE_PATH` | `<data>/shared-budget.sqlite` | SQLite database file |
| `BUDGET_APP_REPLICATION_BLOB_DIR` | `<data>/replication-blobs` | Attachment blob directory |
| `BUDGET_APP_WEB_DIST` | `apps/web/dist` | Static web build |
| `BUDGET_APP_SHUTDOWN_TIMEOUT_MS` | `10000` | Maximum graceful shutdown duration |
| `BUDGET_APP_EXPOSE_PATHS` | `false` | Include filesystem paths in readiness output |

Invalid ports, empty hosts, malformed booleans, and non-positive shutdown timeouts fail before the server opens the database.

## Shutdown

`SIGINT` and `SIGTERM` stop accepting new work, close revision event streams, close idle HTTP connections, close SQLite, and exit. A bounded timeout prevents a deployment from hanging indefinitely.
