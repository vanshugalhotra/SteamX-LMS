FROM node:24-bookworm-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json

RUN pnpm install --filter @steamx/backend... --frozen-lockfile

FROM base AS build

WORKDIR /workspace

RUN corepack enable

COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/apps/backend/node_modules ./apps/backend/node_modules
COPY . .

RUN cd apps/backend && DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm exec prisma generate
RUN pnpm --filter @steamx/backend build

FROM build AS prod-deps

RUN pnpm deploy --filter @steamx/backend --prod /prod

FROM base AS runtime

WORKDIR /app

RUN mkdir -p /app/certs
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/certs/rds-global-bundle.pem
RUN chown node:node /app/certs/rds-global-bundle.pem

ENV NODE_ENV=production
ENV PORT=3333
ENV NODE_EXTRA_CA_CERTS=/app/certs/rds-global-bundle.pem
ENV SSL_CERT_FILE=/app/certs/rds-global-bundle.pem

COPY --from=prod-deps /prod/node_modules ./node_modules
COPY --from=prod-deps /prod/package.json ./package.json
COPY --from=build /workspace/apps/backend/dist ./dist
COPY --from=build /workspace/apps/backend/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build /workspace/apps/backend/prisma/migrations ./prisma/migrations
COPY --from=build /workspace/apps/backend/prisma.config.ts ./prisma.config.ts

USER node

EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3333) + '/health/live').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
LABEL org.opencontainers.image.revision=$GIT_SHA

CMD ["node", "dist/main.js"]
