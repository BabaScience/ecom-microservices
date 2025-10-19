FROM oven/bun:1

WORKDIR /app

# Copy shared package first
COPY packages/shared ./packages/shared

# Copy service files
COPY apps/email-service .

# Modify package.json to use local path for shared package
RUN sed -i 's/"@repo\/shared": "workspace:\*"/"@repo\/shared": "file:.\/packages\/shared"/' package.json

# Install dependencies directly in service directory
RUN bun install

# Expose port
EXPOSE 3006

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3006/health || exit 1

# Start application directly from TypeScript
CMD ["bun", "run", "src/index.ts"]
