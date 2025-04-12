// Mock implementation of the rate-limit module
const store = new Map();

export function createRateLimiter({ limit = 10, windowMs = 60 * 1000, message = 'Too many requests, please try again later.', keyGenerator = (req) => req.headers.get('x-forwarded-for') || '127.0.0.1' }) {
  return async function rateLimiter(req) {
    const key = keyGenerator(req);
    
    // Get current timestamp
    const now = Date.now();
    
    // Initialize or get existing record
    const record = store.get(key) || {
      count: 0,
      reset: now + windowMs,
    };
    
    // If record has expired, reset it
    if (now > record.reset) {
      record.count = 0;
      record.reset = now + windowMs;
    }
    
    // Increment count
    record.count++;
    
    // Update store
    store.set(key, record);
    
    // Check if limit is exceeded
    if (record.count > limit) {
      const resetTime = new Date(record.reset);
      const retryAfter = Math.ceil((record.reset - now) / 1000);
      
      return {
        json: jest.fn().mockReturnValue({
          error: message
        }),
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': resetTime.toISOString(),
        }
      };
    }
    
    return null;
  };
}
