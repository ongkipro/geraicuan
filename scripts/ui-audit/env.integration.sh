#!/usr/bin/env bash
# Env for running the vitest guards these mutation scripts drive
# (tests/design-token-contrast.integration.test.ts,
# tests/rts-presentation.integration.test.ts). Matches README.md's
# "Running the checks" block - source this instead of retyping it.
# Requires POSTGRES_PASSWORD to already be exported (see README.md).
export DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@127.0.0.1:55433/geraicuan_test"
export APP_DATABASE_URL='postgresql://geraicuan_test_runtime:admin123@127.0.0.1:55433/geraicuan_test'
export BETTER_AUTH_URL='http://127.0.0.1:3110'
export BETTER_AUTH_TRUSTED_ORIGINS='http://127.0.0.1:3110'
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-local-test-only-secret-not-production-use}"
unset GERAICUAN_ENABLE_DEMO_LOGIN_HINT
