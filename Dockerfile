# syntax=docker/dockerfile:1
# GeraiCUAN CMS image (T-194; DEP-1 in docs/spec/15-DEVOPS-CICD-MIGRATIONS.md).
#
#   docker build -t geraicuan-app .                 app: tenant and platform hosts, port 3000
#   docker build --target ops -t geraicuan-ops .    one-off jobs: `pnpm db:migrate`,
#                                                   `pnpm ops:bootstrap-super-admin`
#
# No secret is needed or accepted at build time. The origins below are public
# host names; Coolify passes build variables of the same name as build args.

# Node 22 LTS, pinned by version and digest.
ARG NODE_IMAGE=node:22.23.2-alpine3.24@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32

FROM ${NODE_IMAGE} AS base
# pnpm comes from package.json `packageManager` through Corepack, prepared once
# into a shared, readable location so the non-root user never downloads it.
ENV COREPACK_HOME=/opt/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package.json ./
RUN corepack enable && corepack install && chmod -R a+rX /opt/corepack

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ARG GERAICUAN_TENANT_ORIGIN=https://app.geraicuan.com
ARG GERAICUAN_PLATFORM_ORIGIN=https://bos.geraicuan.com
ARG GERAICUAN_PUBLIC_ORIGIN=https://geraicuan.com
ARG BETTER_AUTH_URL=https://app.geraicuan.com
ARG BETTER_AUTH_TRUSTED_ORIGINS=https://app.geraicuan.com,https://bos.geraicuan.com
ARG BETTER_AUTH_TRUSTED_PROXY_CIDRS=10.0.0.0/8
# `next build` imports route modules, which refuse to load without these
# (DEP-1 "What the application refuses"). The database URL is a placeholder the
# build never connects to; the real one is a runtime-only secret.
# Build args are visible to RUN as environment variables.
RUN APP_DATABASE_URL=postgresql://build-placeholder@build.invalid:5432/build-placeholder pnpm build

# One-off jobs against the database. Holds dev dependencies (drizzle-kit) and
# never serves traffic. Needs DATABASE_URL at run time only.
FROM deps AS ops
COPY drizzle.config.ts ./
COPY drizzle ./drizzle
COPY scripts/bootstrap-super-admin.mjs ./scripts/bootstrap-super-admin.mjs
USER node
CMD ["pnpm", "db:migrate"]

# The application: Next.js standalone output, no package manager, non-root.
FROM ${NODE_IMAGE} AS app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
# Host routing answers 404 to any Host but the configured ones, so the check
# sends the tenant host from GERAICUAN_TENANT_ORIGIN. `/login` renders the
# tenant login page without a session or a database read.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "const u=new URL(process.env.GERAICUAN_TENANT_ORIGIN);require('node:http').get({host:'127.0.0.1',port:process.env.PORT,path:'/login',headers:{host:u.host}},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1)).setTimeout(4000,()=>process.exit(1))"]
CMD ["node", "server.js"]
