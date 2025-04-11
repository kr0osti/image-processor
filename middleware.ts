import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createRateLimiter } from './app/utils/rate-limit.js';

// Create a global rate limiter for all API routes
// This is a fallback protection in addition to the per-route rate limiters
const globalApiRateLimiter = createRateLimiter({
  limit: 1000, // 1000 requests per minute across all API endpoints
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many requests to the API. Please try again later.',
  keyGenerator: (req: NextRequest | Request) => {
    // Use IP address as the key
    // In Next.js, we need to use the headers to get the IP address
    const forwardedFor = req.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : 'unknown';
    return `global-api-${ip}`;
  }
});

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only apply rate limiting to API routes
  if (pathname.startsWith('/api/')) {
    // Skip rate limiting for healthcheck to avoid issues with monitoring tools
    if (pathname === '/api/healthcheck') {
      return NextResponse.next();
    }

    // Apply global API rate limiting
    const rateLimitResponse = await globalApiRateLimiter(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
  }

  // Continue with the request
  return NextResponse.next();
}

// Configure the paths that this middleware should run on
export const config = {
  matcher: [
    // Apply to all API routes except healthcheck
    '/api/:path*',
  ],
};
