#!/bin/bash

# Generate Supabase TypeScript types for the app.
# Pass --local to generate from the local database (supabase start).
# Pass --linked to generate from the project the Supabase CLI is linked to
# (e.g. staging, after `supabase link`). CI uses --linked against staging.

set -euo pipefail

APP_TYPES="src/integrations/supabase/types.ts"
EDGE_TYPES="supabase/functions/_shared/database.types.ts"

case "${1:-}" in
  --local)  npx pnpm exec supabase gen types typescript --local > "$APP_TYPES" ;;
  --linked) npx pnpm exec supabase gen types typescript --linked > "$APP_TYPES" ;;
  *) echo "Usage: $0 --local|--linked" >&2; exit 1 ;;
esac

# The repo enforces Prettier (pnpm format:check), so format the raw generator output.
pnpm exec prettier --log-level warn --write "$APP_TYPES"

# Edge functions share the same schema types.
cp "$APP_TYPES" "$EDGE_TYPES"
