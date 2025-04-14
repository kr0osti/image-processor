/**
 * @jest-environment node
 */

// Import the module
import { createRateLimiter } from '../../app/utils/rate-limit';

// Create mock functions
const mockJson = jest.fn((data, options = {}) => ({
  status: options.status || 200,
  headers: new Map(),
  json: async () => data,
}));

// Mock next/server - must be after imports but before tests
jest.mock('next/server', () => ({
  NextResponse: {
    json: mockJson,
  },
}));

describe('Rate Limiter Utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset the mockJson function
    mockJson.mockClear();

    // Reset the Date.now mock if it exists
    if (Date.now.mockRestore) {
      Date.now.mockRestore();
    }
  });

  it('should create a rate limiter function', () => {
    const rateLimiter = createRateLimiter({
      limit: 10,
      windowMs: 60000,
      message: 'Too many requests',
    });

    expect(typeof rateLimiter).toBe('function');
  });

  it('should allow requests within the rate limit', async () => {
    const rateLimiter = createRateLimiter({
      limit: 10,
      windowMs: 60000,
      message: 'Too many requests',
    });

    // Mock request with IP
    const request = {
      ip: '127.0.0.1',
      headers: {
        get: jest.fn((header) => {
          if (header === 'x-forwarded-for') return null;
          return null;
        }),
      },
    };

    // First request should be allowed
    const response = await rateLimiter(request);
    expect(response).toBeNull();
  });

  it('should block requests that exceed the rate limit', async () => {
    const rateLimiter = createRateLimiter({
      limit: 2,
      windowMs: 60000,
      message: 'Too many requests',
    });

    // Mock request with IP
    const request = {
      ip: '127.0.0.1',
      headers: {
        get: jest.fn((header) => {
          if (header === 'x-forwarded-for') return null;
          return null;
        }),
      },
    };

    // Mock Date.now to return a consistent timestamp
    jest.spyOn(Date, 'now').mockImplementation(() => 1000);

    // First request should be allowed
    let response = await rateLimiter(request);
    expect(response).toBeNull();

    // Second request should be allowed
    response = await rateLimiter(request);
    expect(response).toBeNull();

    // Third request should be blocked
    response = await rateLimiter(request);
    expect(response).not.toBeNull();
    expect(response.status).toBe(429);

    // Get the data passed to NextResponse.json
    const data = mockJson.mock.calls[0][0];
    expect(data).toHaveProperty('error', 'Too many requests');
  });

  it('should reset the counter after the window expires', async () => {
    const rateLimiter = createRateLimiter({
      limit: 2,
      windowMs: 60000, // 1 minute
      message: 'Too many requests',
    });

    // Mock request with IP
    const request = {
      ip: '127.0.0.1',
      headers: {
        get: jest.fn(() => null),
      },
    };

    // Mock Date.now to simulate time passing
    let currentTime = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => currentTime);

    // First two requests at time 1000 should be allowed
    await rateLimiter(request);
    await rateLimiter(request);

    // Third request at time 1000 should be blocked
    let response = await rateLimiter(request);
    expect(response).not.toBeNull();
    expect(response.status).toBe(429);

    // Advance time by more than the window
    currentTime += 61000; // 1 minute and 1 second later

    // Request after window expires should be allowed again
    response = await rateLimiter(request);
    expect(response).toBeNull();
  });

  it('should use different counters for different IPs', async () => {
    const rateLimiter = createRateLimiter({
      limit: 2,
      windowMs: 60000,
      message: 'Too many requests',
    });

    // Mock requests with different IPs
    const request1 = {
      ip: '127.0.0.1',
      headers: {
        get: jest.fn(() => null),
      },
    };

    const request2 = {
      ip: '192.168.1.1',
      headers: {
        get: jest.fn(() => null),
      },
    };

    // Mock Date.now
    jest.spyOn(Date, 'now').mockImplementation(() => 1000);

    // First two requests from IP1 should be allowed
    await rateLimiter(request1);
    await rateLimiter(request1);

    // Third request from IP1 should be blocked
    let response = await rateLimiter(request1);
    expect(response).not.toBeNull();
    expect(response.status).toBe(429);

    // First request from IP2 should be allowed
    response = await rateLimiter(request2);
    expect(response).toBeNull();
  });
});
