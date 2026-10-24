# syntax=docker/dockerfile:1
FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS manifests
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY contracts/package.json ./contracts/package.json
COPY services/api/package.json ./services/api/package.json
COPY apps/web/package.json ./apps/web/package.json

FROM manifests AS build
RUN npm ci --no-audit
COPY contracts/ ./contracts/
COPY services/api/ ./services/api/
RUN npm run build -w @chordviewer/contracts && npm run build -w @chordviewer/api

FROM manifests AS runtime-dependencies
RUN npm ci --no-audit --omit=dev --workspace @chordviewer/contracts --workspace @chordviewer/api --include-workspace-root=false && npm cache clean --force

FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS runtime
ENV NODE_ENV=production
# Package installation belongs to build stages; do not ship npm's CLI/dependency tree.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /app
COPY --from=runtime-dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
# npm may install conflicting versions in workspace-local node_modules directories.
COPY --from=runtime-dependencies /app/contracts ./contracts
COPY --from=build /app/contracts/dist ./contracts/dist
COPY --from=build /app/contracts/src/lead-sheet-v1.schema.json /app/contracts/src/lead-sheet-v2.schema.json /app/contracts/src/lead-sheet-v3.schema.json ./contracts/src/
COPY --from=build /app/contracts/fixtures ./contracts/fixtures
COPY --from=runtime-dependencies /app/services/api ./services/api
COPY --from=build /app/services/api/dist ./services/api/dist
USER node
EXPOSE 3000
CMD ["sh", "-c", "node services/api/dist/migrate.js && exec node services/api/dist/server.js"]
