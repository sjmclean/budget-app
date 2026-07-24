#!/usr/bin/env bash
set -euo pipefail

rm -f \
  apps/web/src/features/persistence/appPersistenceGateway.ts \
  apps/web/src/features/persistence/appPersistenceGatewayFactory.ts \
  apps/web/src/features/persistence/sqliteAccountPersistenceAdapter.ts \
  apps/web/src/features/persistence/sqliteAccountRegisterPersistenceAdapter.ts \
  apps/web/src/features/persistence/sqlitePayeePersistenceAdapter.ts \
  apps/web/src/features/persistence/sqlitePersistenceGateway.ts

rm -f tests/v13*.ts tests/v140*.ts
rm -f docs/v130-*.md docs/v131-*.md docs/v132-*.md docs/v133-*.md docs/v134-*.md \
  docs/v135-*.md docs/v136-*.md docs/v137-*.md docs/v138-*.md docs/v139-*.md docs/v140-*.md

echo "Milestone 14 obsolete persistence files removed."
