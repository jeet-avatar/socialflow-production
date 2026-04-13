# remotion-service/Dockerfile
# Build context: repo root (.)
FROM node:20.14-slim AS base
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium fonts-liberation libgbm1 libnss3 libatk-bridge2.0-0 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 \
    curl && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_PATH=/usr/bin/chromium

FROM base AS deps
COPY remotion-service/package*.json ./
RUN npm ci --only=production

FROM base AS builder
COPY remotion-service/package*.json ./
RUN npm ci
COPY remotion-service/src ./src
COPY remotion-service/tsconfig.json .
RUN npm run build

FROM base AS production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "dist/render-server.js"]
