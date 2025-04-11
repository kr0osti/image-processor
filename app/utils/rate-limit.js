/**
 * Rate limiting utility for Next.js API routes
 * 
 * This module provides a simple in-memory rate limiter for Next.js API routes.
 * It tracks request counts per IP address and returns 429 responses when limits are exceeded.
 */

/**
 * Configuration options for the rate limiter
 * @typedef {Object} RateLimitConfig
 * @property {number} limit - Maximum number of requests allowed within the window
 * @property {number} windowMs - Time window in milliseconds
 * @property {string} [message] - Optional message to return when rate limited
 * @property {Function} [keyGenerator] - Optional function to generate a key to identify clients
 */

/**
 * Store entry for rate limiting
 * @typedef {Object} RateLimitStoreEntry
 * @property {number} count - Number of requests made
 * @property {number} resetTime - Timestamp when the rate limit resets
 */

/**
 * In-memory store for rate limiting
 * Note: This will be reset when the server restarts
 * For production, consider using Redis or another persistent store
 * @type {Object.<string, RateLimitStoreEntry>}
 */
const store = {};

/**
 * Cleans up expired entries from the rate limit store
 */
function cleanupStore() {
  const now = Date.now();
  Object.keys(store).forEach(key => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}

// Run cleanup every 5 minutes
setInterval(cleanupStore, 5 * 60 * 1000);

/**
 * Creates a rate limiter middleware for Next.js API routes
 * 
 * @param {RateLimitConfig} config - Rate limiting configuration
 * @returns {Function} A function that can be used to rate limit requests
 */
export function createRateLimiter(config) {
  const {
    limit = 60,
    windowMs = 60 * 1000, // 1 minute by default
    message = 'Too many requests, please try again later.',
    keyGenerator = (req) => {
      // Default to IP-based rate limiting
      // In Next.js, we need to use the headers to get the IP address
      const forwardedFor = req.headers.get('x-forwarded-for');
      const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : 'unknown';
      return `${ip}`;
    }
  } = config;

  /**
   * Rate limit middleware function
   * @param {Request} req - The incoming request
   * @returns {Promise<Response|null>} A response object if rate limited, null otherwise
   */
  return async function rateLimit(req) {
    const key = keyGenerator(req);
    const now = Date.now();
    
    // Initialize or get the current rate limit data for this key
    if (!store[key] || store[key].resetTime < now) {
      store[key] = {
        count: 0,
        resetTime: now + windowMs
      };
    }
    
    // Increment the counter
    store[key].count += 1;
    
    // Check if the request exceeds the rate limit
    if (store[key].count > limit) {
      // Calculate when the rate limit will reset
      const resetTimeMs = store[key].resetTime;
      
      // Create a response with appropriate headers
      const { NextResponse } = await import('next/server');
      return NextResponse.json(
        { error: message },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((resetTimeMs - now) / 1000).toString(),
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Math.ceil(resetTimeMs / 1000).toString()
          }
        }
      );
    }
    
    // Request is allowed, return null to continue processing
    return null;
  };
}
