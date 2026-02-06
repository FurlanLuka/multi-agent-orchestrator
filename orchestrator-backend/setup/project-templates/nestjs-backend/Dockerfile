# =============================================================================
# NestJS Backend Dockerfile (Prisma 7 + better-sqlite3)
# =============================================================================
#
# IMPORTANT: Uses Debian-based images (NOT Alpine)
# - better-sqlite3 requires glibc; Alpine uses musl which causes runtime errors
# - If switching to PostgreSQL/MySQL, Alpine images become safe to use
#
# -----------------------------------------------------------------------------
# PRODUCTION DEPLOYMENT NOTES
# -----------------------------------------------------------------------------
#
# Volume Mounting (CRITICAL for SQLite):
#   The /app/data directory MUST be mounted as a persistent volume.
#   Without this, data is lost when the container restarts.
#
# Docker Compose Example:
#   services:
#     backend:
#       build: ./backend
#       ports:
#         - "3000:3000"
#       volumes:
#         - backend-data:/app/data    # Persistent SQLite storage
#       environment:
#         - NODE_ENV=production
#         - DATABASE_URL=file:/app/data/production.db
#         # Add other env vars as needed (API keys, secrets, etc.)
#
#   volumes:
#     backend-data:
#
# Running Migrations:
#   Before starting the app for the first time (or after schema changes):
#     docker exec <container> npx prisma migrate deploy
#   Or add an entrypoint script that runs migrations on startup.
#
# Environment Variables:
#   - DATABASE_URL: SQLite file path (default: file:/app/data/production.db)
#   - PORT: Server port (default: 3000)
#   - NODE_ENV: Should be "production" in prod
#   - Add your own: JWT_SECRET, API_KEYS, etc.
#
# Scaling Considerations:
#   SQLite is single-writer and file-based. For horizontal scaling or
#   high-concurrency, migrate to PostgreSQL:
#   1. Update prisma/schema.prisma provider to "postgresql"
#   2. Remove @prisma/adapter-better-sqlite3 dependency
#   3. Switch to Alpine images (smaller, faster builds)
#   4. Update DATABASE_URL to PostgreSQL connection string
#
# =============================================================================

# Stage 1: Builder
FROM node:22-slim AS builder

# Build tools required for better-sqlite3 native module compilation
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install dependencies (postinstall hook runs "prisma generate")
# Dummy DATABASE_URL needed for prisma generate to succeed
ENV DATABASE_URL="file:./dummy.db"
RUN npm install

# Copy source and build
COPY tsconfig.json nest-cli.json ./
COPY src ./src/
RUN npm run build

# Remove devDependencies to reduce image size
RUN npm prune --production

# -----------------------------------------------------------------------------
# Stage 2: Production
# -----------------------------------------------------------------------------
FROM node:22-slim AS production

# OpenSSL required by Prisma, tini for proper signal handling
RUN apt-get update && apt-get install -y openssl tini \
    && rm -rf /var/lib/apt/lists/*

# Run as non-root user for security
RUN groupadd --gid 1001 nodejs \
    && useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nodejs

WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma/
COPY --from=builder --chown=nodejs:nodejs /app/prisma.config.ts ./
COPY --from=builder --chown=nodejs:nodejs /app/src/generated ./src/generated/

# Data directory for SQLite - MUST be mounted as volume in production
RUN mkdir -p /app/data && chown nodejs:nodejs /app/data

USER nodejs

# Default environment (override in docker-compose or deployment config)
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL="file:/app/data/production.db"

EXPOSE 3000

# Use tini as init system for proper signal handling
ENTRYPOINT ["/usr/bin/tini", "--"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

CMD ["node", "dist/src/main"]
