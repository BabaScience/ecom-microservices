FROM oven/bun:1

WORKDIR /app

# Copy shared package first
COPY packages/shared ./packages/shared

# Copy service files
COPY apps/api-gateway .

# Modify package.json to use local path for shared package
RUN sed -i 's/"@repo\/shared": "workspace:\*"/"@repo\/shared": "file:.\/packages\/shared"/' package.json

# Install dependencies directly in service directory
RUN bun install

# Expose port
EXPOSE 3000

# Start application
CMD ["bun", "run", "src/index.ts"]

