#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

rm -f \
  apps/web/src/features/persistence/sharedServerStorageClient.ts \
  apps/web/src/features/persistence/sharedServerKeyValueStorage.ts \
  apps/web/src/features/persistence/sharedServerPersistenceProvider.ts \
  apps/web/src/features/persistence/browserToSharedServerMigration.ts \
  tests/v144-shared-server-key-value-storage.ts \
  tests/v145-shared-server-persistence-provider.ts \
  tests/v147-browser-to-shared-server-migration.ts \
  tests/v153-shared-budget-automatic-refresh.ts \
  tests/v154-shared-budget-optimistic-concurrency.ts \
  tests/v155-shared-budget-server-sent-events.ts \
  tests/v156-shared-runtime-persistence-routing.ts

echo "Removed legacy shared-server runtime and tests."
