FROM node:24-alpine AS base
# pnpm comes from corepack, pinned by the "packageManager" field in package.json
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Install dependencies using pnpm
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm build

# Development image for local development
FROM base AS development
WORKDIR /app

# Install dependencies
RUN apk add --no-cache curl

# Copy package.json and pnpm-lock.yaml
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the application
COPY . .

# Create uploads directory with proper permissions
RUN mkdir -p /app/public/uploads && chmod -R 777 /app/public/uploads

# Set environment variables
ENV PORT=3000
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1

# Start the development server
CMD ["pnpm", "dev"]

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Install curl for healthcheck and su-exec for user switching
RUN apk add --no-cache curl su-exec

# Create uploads directory with proper permissions
RUN mkdir -p /app/public/uploads && chown -R nextjs:nodejs /app/public && chmod -R 777 /app/public/uploads

COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy and set up entrypoint script (must be root-owned to run as root initially)
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && chown root:root /entrypoint.sh

EXPOSE 3000

ENV PORT=3000
# Next.js standalone binds to $HOSTNAME; Docker sets it to the container ID,
# which leaves localhost (and the container healthcheck) unreachable
ENV HOSTNAME=0.0.0.0

ENTRYPOINT ["/entrypoint.sh"]
# Larger request headers for chunked uploads (/api/process/uploads), whose
# data travels in a header. A command-line flag, so a NODE_OPTIONS set in
# .env can't drop it
CMD ["node", "--max-http-header-size=65536", "server.js"]
