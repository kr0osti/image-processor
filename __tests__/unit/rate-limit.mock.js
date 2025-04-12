/**
 * Mock for the rate-limit module to prevent open handles in tests
 */

// Mock the store
const store = new Map();

// Mock the cleanup function
function cleanupStore() {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (now > value.expiry) {
      store.delete(key);
    }
  }
}

/**
 * Creates a rate limiter middleware for Next.js API routes
 * 
 * @param {Object} config - Rate limiting configuration
 * @param {number} config.interval - Time window in milliseconds
 * @param {number} config.limit - Maximum number of requests allowed in the time window
 * @returns {Function} Middleware function
 */
function rateLimit({ interval = 60 * 1000, limit = 10 }) {
  return async function rateLimitMiddleware(req, res, next) {
    // Get IP address from request
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    // Create a unique key for this IP and endpoint
    const key = `${ip}-${req.url}`;
    
    // Get current timestamp
    const now = Date.now();
    
    // Initialize or get existing record
    const record = store.get(key) || {
      count: 0,
      expiry: now + interval,
    };
    
    // If record has expired, reset it
    if (now > record.expiry) {
      record.count = 0;
      record.expiry = now + interval;
    }
    
    // Increment count
    record.count++;
    
    // Update store
    store.set(key, record);
    
    // Check if limit is exceeded
    if (record.count > limit) {
      return {
        success: false,
        limit,
        remaining: 0,
        reset: new Date(record.expiry).toISOString(),
      };
    }
    
    return {
      success: true,
      limit,
      remaining: limit - record.count,
      reset: new Date(record.expiry).toISOString(),
    };
  };
}

module.exports = { rateLimit };
