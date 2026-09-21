# syntax=docker/dockerfile:1
FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS manifests
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY contracts/package.json ./contracts/package.json
COPY services/api/package.json ./services/api/package.json
COPY apps/web/package.json ./apps/web/package.json

FROM manifests AS build
RUN npm ci
COPY contracts/ ./contracts/
COPY services/api/ ./services/api/
RUN npm run build -w @chordviewer/contracts && npm run build -w @chordviewer/api

FROM manifests AS runtime-dependencies
RUN npm ci --omit=dev --workspace @chordviewer/contracts --workspace @chordviewer/api --include-workspace-root=false && npm cache clean --force

FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=runtime-dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
# npm may install conflicting versions in workspace-local node_modules directories.
COPY --from=runtime-dependencies /app/contracts ./contracts
COPY --from=build /app/contracts/dist ./contracts/dist
COPY --from=build /app/contracts/src/lead-sheet-v1.schema.json /app/contracts/src/lead-sheet-v2.schema.json ./contracts/src/
COPY --from=build /app/contracts/fixtures ./contracts/fixtures
COPY --from=runtime-dependencies /app/services/api ./services/api
COPY --from=build /app/services/api/dist ./services/api/dist
USER node
EXPOSE 3000
CMD ["sh", "-c", "node services/api/dist/migrate.js && exec node services/api/dist/server.js"]
