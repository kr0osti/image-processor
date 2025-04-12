FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Install dependencies using pnpm
COPY package.json pnpm-lock.yaml* ./
RUN apk add --no-cache curl
RUN npm install -g pnpm@8.15.1
# Make sure pnpm is in the PATH
ENV PATH="/usr/local/bin:$PATH"
RUN pnpm install --no-frozen-lockfile

# Copy the regenerated lockfile to a location we can access from outside
RUN cp pnpm-lock.yaml /tmp/pnpm-lock.yaml

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Install pnpm in the builder stage
RUN npm install -g pnpm@8.15.1
ENV PATH="/usr/local/bin:$PATH"

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
RUN npm install -g pnpm@8.15.1
ENV PATH="/usr/local/bin:$PATH"

# Copy package.json and pnpm-lock.yaml
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install

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

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create uploads directory with proper permissions
RUN mkdir -p /app/public/uploads && chown -R nextjs:nodejs /app/public && chmod -R 777 /app/public/uploads

COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000

CMD ["node", "server.js"]
