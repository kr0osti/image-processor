import { NextRequest, NextResponse } from 'next/server';
import { createRateLimiter } from '../../utils/rate-limit.js';

// Create a rate limiter for the healthcheck endpoint
// Allow 30 requests per minute per IP address
const rateLimiter = createRateLimiter({
  limit: 30,
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many healthcheck requests. Please try again later.'
});

/**
 * API route handler for health checking the application
 *
 * This endpoint provides a simple health check that returns a 200 status code
 * and the current timestamp. It can be used by monitoring tools to verify
 * that the application is running and responsive.
 *
 * Rate limited to 30 requests per minute per IP address.
 *
 * @param {NextRequest} request - The incoming HTTP request
 * @returns {Promise<NextResponse>} JSON response with status and timestamp
 */
export async function GET(request: NextRequest) {
  // Check rate limit before processing the request
  const rateLimitResponse = await rateLimiter(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() }, { status: 200 });
}