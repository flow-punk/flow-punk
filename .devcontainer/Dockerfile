FROM mcr.microsoft.com/devcontainers/typescript-node:1-20-bookworm

# Install pnpm globally
RUN npm install -g pnpm@9.15.0

# Install wrangler CLI for Cloudflare Workers development
RUN npm install -g wrangler

# Install additional utilities
RUN apt-get update && apt-get install -y \
    postgresql-client \
    curl \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Set pnpm store directory
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

WORKDIR /workspace

# Pre-create node_modules so Docker initializes the named volume with correct ownership
RUN mkdir -p /workspace/node_modules && chown -R node:node /workspace
