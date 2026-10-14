import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { cleanupOldUploads } from '../../utils/cleanup';
import { createRateLimiter } from '../../utils/rate-limit.js';

// Create a rate limiter for failed cleanup authorization attempts
// Allow only 5 failed attempts per minute per IP address
const rateLimiter = createRateLimiter({
  limit: 5,
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many cleanup requests. Please try again later.',
  name: 'cleanup'
});

/**
 * Compares two strings in constant time
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} True if the strings are equal
 */
function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * API route handler for triggering cleanup of old uploads
 *
 * This endpoint triggers the cleanup of old uploaded files.
 * It requires an API key for authorization. Failed authorization attempts are
 * rate limited to prevent brute forcing the key; authorized calls (such as the
 * in-container cleanup script) are never rate limited.
 *
 * Rate limited to 5 failed attempts per minute per IP address.
 *
 * @param {Request} request - The incoming HTTP request
 * @returns {Promise<NextResponse>} JSON response with cleanup results
 * @throws {Error} If cleanup process fails
 */
export async function GET(request) {
  try {
    // Get the API key from the request (for security)
    const url = new URL(request.url);
    const apiKey = url.searchParams.get('key');

    // Check if API key is provided and valid (you should use an environment variable for this)
    const validApiKey = process.env.CLEANUP_API_KEY || 'change-this-to-a-secure-key';

    if (!apiKey || !safeEqual(apiKey, validApiKey)) {
      // Only failed attempts count towards the rate limit
      const rateLimitResponse = await rateLimiter(request);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get custom max age from query params (in minutes), default to 60 minutes (1 hour)
    // Values below 1 minute (or invalid values) fall back to the default
    let maxAgeMinutes = parseInt(url.searchParams.get('maxAge') || '60', 10);
    if (!Number.isFinite(maxAgeMinutes) || maxAgeMinutes < 1) {
      maxAgeMinutes = 60;
    }
    const maxAgeMs = maxAgeMinutes * 60 * 1000;

    // Run the cleanup
    const result = await cleanupOldUploads(maxAgeMs);

    return NextResponse.json({
      success: true,
      message: `Cleanup complete. Deleted ${result.deleted} files, encountered ${result.errors} errors.`,
      ...result
    });
  } catch (error) {
    console.error('Error in cleanup route:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to run cleanup',
      error: error.message
    }, { status: 500 });
  }
}
