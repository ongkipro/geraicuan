#!/usr/bin/env bash
# Env for running the dev server this browser sweep points at, and for
# `pnpm db:seed-local`. Matches README.md's "Local development" block -
# source this instead of retyping it. Requires POSTGRES_PASSWORD to already
# be exported (see README.md).
export DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@127.0.0.1:55433/geraicuan_test"
export APP_DATABASE_URL='postgresql://geraicuan_test_runtime:admin123@127.0.0.1:55433/geraicuan_test'
export DEV_HOST="${DEV_HOST:-localhost}"
export DEV_ORIGIN="http://${DEV_HOST}:${PORT:-3000}"
export BETTER_AUTH_URL="$DEV_ORIGIN"
export BETTER_AUTH_TRUSTED_ORIGINS="$DEV_ORIGIN"
export NEXT_ALLOWED_DEV_ORIGINS="$DEV_HOST"
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-local-dev-only-secret-do-not-use-in-prod}"
export DEV_LOCAL_PASSWORD='admin123'
export GERAICUAN_ENABLE_DEMO_LOGIN_HINT='1'
export PORT="${PORT:-3000}"
