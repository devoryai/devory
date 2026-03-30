# =============================================================================
# Devory CLI — Docker container
# =============================================================================
#
# This Dockerfile packages the Devory CLI (@devory/cli) for use in CI/CD
# pipelines and containerized environments.
#
# The self-hosted Devory engine image (with AI model integration) is
# available separately at ghcr.io/bridgm/devory-engine:latest.
#
# Build locally:
#   docker build -t devory/cli:local .
#
# Run against a mounted workspace:
#   docker run --rm \
#     -v /path/to/your/project:/workspace \
#     devory/cli:local task list
#
# =============================================================================

FROM node:20-slim AS builder

WORKDIR /build

# Install dependencies (all workspace packages must be present for npm ci)
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/package.json
COPY packages/cli/package.json ./packages/cli/package.json
COPY packages/github/package.json ./packages/github/package.json
COPY packages/vscode/package.json ./packages/vscode/package.json

RUN npm ci --ignore-scripts

# Copy source
COPY packages/ ./packages/
COPY tsconfig.json ./

# Build all packages
RUN npm run build

# =============================================================================
# Runtime image
# =============================================================================
FROM node:20-slim AS runtime

LABEL org.opencontainers.image.title="Devory CLI"
LABEL org.opencontainers.image.description="Devory task and run management CLI"
LABEL org.opencontainers.image.vendor="Devory.AI"
LABEL org.opencontainers.image.source="https://github.com/bridgm/devory-public"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

# Copy the built packages from builder
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/packages/core/dist ./packages/core/dist
COPY --from=builder /build/packages/cli/dist ./packages/cli/dist
COPY --from=builder /build/packages/core/package.json ./packages/core/package.json
COPY --from=builder /build/packages/cli/package.json ./packages/cli/package.json

# Default factory root — mount your workspace here
ENV DEVORY_FACTORY_ROOT=/workspace

WORKDIR /workspace

ENTRYPOINT ["node", "/app/packages/cli/dist/bin.js"]
CMD ["--help"]
