# ---- Stage 1: Build ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies cleanly
COPY package.json package-lock.json* ./
RUN npm ci

# Copy application source and build Vite frontend + esbuild server bundle
COPY . .
RUN npm run lint && npm run build

# ---- Stage 2: Production Runtime ----
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Install only production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled build artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/metadata.json ./metadata.json
COPY --from=builder /app/public ./public

# Drop privileges to non-root user
RUN chown -R node:node /app
USER node

EXPOSE 3000

# Container liveness healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health/live || exit 1

CMD ["node", "dist/server.cjs"]
