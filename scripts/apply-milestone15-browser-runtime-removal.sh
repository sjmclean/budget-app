#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

rm -f \
  apps/web/src/features/persistence/browserLocalStoragePersistenceGateway.ts \
  scripts/check-milestone2-persistence.mjs \
  scripts/validate-milestone14-persistence-cleanup.mjs \
  tests/v141-budget-persistence-provider.ts \
  tests/v142-provider-runtime-activation.ts \
  tests/v143-provider-owned-lifecycle.ts \
  tests/v146-runtime-persistence-selection.ts

echo "Removed the alternate browser persistence runtime and obsolete migration-era validations."
