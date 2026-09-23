#!/usr/bin/env bash
# Full database backup for the Arihant Collection rental DB.
#
# Usage:
#   ./scripts/backup.sh                 # backup to /root/backups/arihantcollection/<timestamp>
#   BACKUP_ROOT=/some/dir ./scripts/backup.sh
#
# Produces, per run:
#   <dir>/dump/       -> mongodump BSON (use for a full restore)
#   <dir>/json/       -> mongoexport JSON (human readable)
#   <dir>.tar.gz      -> compressed archive of the above
#
# Restore a collection from BSON, e.g. customers:
#   mongorestore --uri="$MONGODB_URI" --nsInclude='rentaldress.customers' <dir>/dump

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Load MONGODB_URI from .env if not already in the environment
if [[ -z "${MONGODB_URI:-}" && -f .env ]]; then
  MONGODB_URI="$(grep -E '^\s*MONGODB_URI\s*=' .env | head -1 | cut -d= -f2- | tr -d ' \r')"
fi

if [[ -z "${MONGODB_URI:-}" ]]; then
  echo "ERROR: MONGODB_URI not set (checked env and .env)" >&2
  exit 1
fi

BACKUP_ROOT="${BACKUP_ROOT:-/root/backups/arihantcollection}"
TS="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_ROOT/$TS"
mkdir -p "$DEST/json"

echo "==> Backing up to $DEST"

# 1. BSON dump (authoritative, restorable)
mongodump --uri="$MONGODB_URI" --out="$DEST/dump" >/dev/null
echo "    BSON dump done"

# 2. JSON exports (readable)
for c in items customers rentals users counters; do
  mongoexport --uri="$MONGODB_URI" --collection="$c" --jsonArray --pretty \
    --out="$DEST/json/$c.json" 2>/dev/null || echo "    (skipped $c)"
done
echo "    JSON export done"

# 3. Compressed archive
tar -czf "$DEST.tar.gz" -C "$BACKUP_ROOT" "$TS"
echo "    Archive: $DEST.tar.gz"

# 4. Retention: keep the 30 most recent archives
ls -1dt "$BACKUP_ROOT"/*.tar.gz 2>/dev/null | tail -n +31 | xargs -r rm -f

echo "==> Done"
du -sh "$DEST" "$DEST.tar.gz"
