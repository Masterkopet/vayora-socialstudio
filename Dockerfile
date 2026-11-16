FROM node:24-bookworm-slim AS base

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fontconfig fonts-liberation ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
FROM base AS builder
COPY package.json package-lock.json ./
RUN npm ci
COPY next.config.mjs ./
COPY src/ ./src/
COPY public/ ./public/
COPY scripts/sync-vendor.mjs scripts/prepare-standalone.mjs ./scripts/
COPY knowledge/vayora-brand.json ./knowledge/vayora-brand.json
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3210 DATA_DIR=/app/data REQUIRE_EXISTING_OWNER=true
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/knowledge/vayora-brand.json ./knowledge/vayora-brand.json
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3210
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health',{headers:{Host:'localhost:'+process.env.PORT}}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
