# syntax=docker/dockerfile:1

# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app

# ARG for debug flag (moved here after the first FROM)
ARG NEXT_PUBLIC_DEBUG=false
ENV NEXT_PUBLIC_DEBUG=${NEXT_PUBLIC_DEBUG}

# Make sure to print environment variables during build for debugging
RUN echo "Debug setting: $NEXT_PUBLIC_DEBUG"

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies using pnpm
RUN npm install -g pnpm && \
    pnpm install

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Pass the debug flag to the builder stage
ARG NEXT_PUBLIC_DEBUG=false
ENV NEXT_PUBLIC_DEBUG=${NEXT_PUBLIC_DEBUG}

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN npm install -g pnpm && \
    pnpm build

# Stage 3: Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# Pass the debug flag to the runner stage
ARG NEXT_PUBLIC_DEBUG=false
ENV NEXT_PUBLIC_DEBUG=${NEXT_PUBLIC_DEBUG}
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy necessary files from builder
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Expose the port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
