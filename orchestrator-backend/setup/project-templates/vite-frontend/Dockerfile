# =============================================================================
# Vite + React Frontend Dockerfile
# =============================================================================
#
# Uses Alpine images (safe - no native Node modules)
# Serves static files via nginx with SPA routing support
#
# -----------------------------------------------------------------------------
# PRODUCTION DEPLOYMENT NOTES
# -----------------------------------------------------------------------------
#
# Environment Variables (Build-Time Only!):
#   Vite embeds env vars at BUILD time, not runtime. Variables prefixed with
#   VITE_ are replaced during `vite build`. To change them, you must rebuild.
#
#   Common pattern for API URL:
#     ARG VITE_API_URL=http://localhost:3000
#     ENV VITE_API_URL=$VITE_API_URL
#     # Then in docker-compose: build: args: VITE_API_URL: https://api.example.com
#
# Docker Compose Example:
#   services:
#     frontend:
#       build:
#         context: ./frontend
#         args:
#           VITE_API_URL: http://backend:3000   # Internal Docker network
#       ports:
#         - "80:80"
#       depends_on:
#         - backend
#
#     backend:
#       build: ./backend
#       # ... backend config
#
# Runtime Environment Variables (Alternative):
#   For runtime config without rebuilding, you can:
#   1. Create a config.js that reads from window.__CONFIG__
#   2. Mount or generate config.js at container startup
#   3. Or use nginx sub_filter to replace placeholders in index.html
#
# Reverse Proxy / Load Balancer:
#   When behind a reverse proxy (Traefik, nginx, etc.):
#   - The container exposes port 80 (HTTP)
#   - SSL/TLS termination should happen at the proxy level
#   - Ensure proxy passes correct headers (X-Forwarded-For, X-Forwarded-Proto)
#
# Custom nginx Configuration:
#   The nginx.conf file handles:
#   - SPA routing (try_files fallback to index.html)
#   - Gzip compression
#   - Cache headers (1 year for hashed assets, no-cache for index.html)
#   - Basic security headers
#   Modify nginx.conf for custom domains, SSL, or additional headers.
#
# =============================================================================

# Stage 1: Builder
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

# Copy config and source files
COPY tsconfig.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src/
# If you have a public directory for static assets, uncomment:
# COPY public ./public/

# Build args for environment variables (optional)
# ARG VITE_API_URL
# ENV VITE_API_URL=$VITE_API_URL

RUN npx vite build

# -----------------------------------------------------------------------------
# Stage 2: Production (nginx)
# -----------------------------------------------------------------------------
FROM nginx:alpine AS production

# Copy nginx config and built assets
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/dist /usr/share/nginx/html

# Set proper permissions for nginx to run as non-root (optional security hardening)
RUN chown -R nginx:nginx /usr/share/nginx/html \
    && chown -R nginx:nginx /var/cache/nginx \
    && chown -R nginx:nginx /var/log/nginx \
    && touch /var/run/nginx.pid \
    && chown -R nginx:nginx /var/run/nginx.pid

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
