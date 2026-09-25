# syntax=docker/dockerfile:1
# GeraiCUAN landing site (T-194; DEP-1). Build context: apps/landing.
#
#   docker build -t geraicuan-landing apps/landing      serves https://geraicuan.com on port 8080
#
# Static output only: Astro builds it, unprivileged nginx serves it.

FROM node:22.23.2-alpine3.24@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build
WORKDIR /site
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Origin of the "Daftar" and "Masuk" links; the build fails on a path, query or credentials.
ARG PUBLIC_APP_ORIGIN=https://app.geraicuan.com
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.31.6-alpine3.24@sha256:b54ac358b83fc6c965793fd271839b4ea4cdb6e99895bb19618cbc2ca152d972
COPY --from=build /site/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "--spider", "http://127.0.0.1:8080/"]
