#!/bin/sh
set -eu

# Validate before touching the database; never run the demo seed here.
node scripts/check-config.js
./node_modules/.bin/prisma migrate deploy
# Ensure the default admin account exists (safe to rerun; never overwrites password).
node scripts/ensure-admin.js
exec "$@"
