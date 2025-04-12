import { createRateLimiter } from '../../app/utils/rate-limit';
import { NextResponse } from 'next/server';

// Mock NextResponse
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn().mockImplementation((body, options) => ({
      body,
      ...options,
    })),
  },
}));

describe('Rate Limiter', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should allow requests within the rate limit', async () => {
    // Create a rate limiter with a limit of 2 requests
    const rateLimiter = createRateLimiter({
      limit: 2,
      windowMs: 60 * 1000, // 1 minute
      keyGenerator: () => 'test-ip', // Use a fixed key for testing
    });

    // First request should be allowed
    const req1 = { headers: { get: () => '127.0.0.1' } };
    const res1 = await rateLimiter(req1);
    expect(res1).toBeNull();

    // Second request should be allowed
    const req2 = { headers: { get: () => '127.0.0.1' } };
    const res2 = await rateLimiter(req2);
    expect(res2).toBeNull();
  });

  it('should block requests that exceed the rate limit', async () => {
    // Create a rate limiter with a limit of 2 requests
    const rateLimiter = createRateLimiter({
      limit: 2,
      windowMs: 60 * 1000, // 1 minute
      keyGenerator: () => 'test-ip-2', // Use a fixed key for testing
    });

    // First two requests should be allowed
    await rateLimiter({ headers: { get: () => '127.0.0.1' } });
    await rateLimiter({ headers: { get: () => '127.0.0.1' } });

    // Third request should be blocked
    const req3 = { headers: { get: () => '127.0.0.1' } };
    const res3 = await rateLimiter(req3);
    
    expect(res3).not.toBeNull();
    expect(NextResponse.json).toHaveBeenCalledWith(
      { error: 'Too many requests, please try again later.' },
      expect.objectContaining({
        status: 429,
        headers: expect.objectContaining({
          'Retry-After': expect.any(String),
          'X-RateLimit-Limit': '2',
          'X-RateLimit-Remaining': '0',
        }),
      })
    );
  });

  it('should use custom message when provided', async () => {
    // Create a rate limiter with a custom message
    const customMessage = 'Custom rate limit message';
    const rateLimiter = createRateLimiter({
      limit: 1,
      windowMs: 60 * 1000,
      message: customMessage,
      keyGenerator: () => 'test-ip-3',
    });

    // First request should be allowed
    await rateLimiter({ headers: { get: () => '127.0.0.1' } });

    // Second request should be blocked with custom message
    await rateLimiter({ headers: { get: () => '127.0.0.1' } });
    
    expect(NextResponse.json).toHaveBeenCalledWith(
      { error: customMessage },
      expect.anything()
    );
  });

  it('should use custom key generator when provided', async () => {
    // Create a rate limiter with a custom key generator
    const keyGenerator = jest.fn().mockReturnValue('custom-key');
    const rateLimiter = createRateLimiter({
      limit: 1,
      windowMs: 60 * 1000,
      keyGenerator,
    });

    const req = { headers: { get: () => '127.0.0.1' } };
    await rateLimiter(req);

    expect(keyGenerator).toHaveBeenCalledWith(req);
  });
});
