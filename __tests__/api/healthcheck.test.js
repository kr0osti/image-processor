if (typeof Request === "undefined") { global.Request = class Request {}; }
/**
 * @jest-environment node
 */

// Import the API route
const { GET } = require('../../app/api/healthcheck/route');
const { NextRequest } = require('next/server');

// Create mock functions


// Mock next/server - must be after imports but before tests
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data) => ({ status: 200, headers: new Map(), json: async () => data })),
  },
  NextRequest: class MockNextRequest {
    constructor(url) {
      this.url = url;
      this.nextUrl = new URL(url);
    }
  },
}));

// Mock the rate limiter
jest.mock('../../app/utils/rate-limit.js', () => ({
  createRateLimiter: jest.fn(() => jest.fn().mockResolvedValue(null)),
}));

describe('Healthcheck API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return a 200 status code with status and timestamp', async () => {
    // Create a mock request
    const request = { url: 'http://localhost:3000/api/healthcheck', nextUrl: new URL('http://localhost:3000/api/healthcheck') };

    // Call the API handler
    const response = await GET(request);

    // Verify the response
    expect(response.status).toBe(200);

    // Get the data passed to NextResponse.json
    const data = require('next/server').NextResponse.json.mock.calls[0][0];

    // Verify the response data
    expect(data).toHaveProperty('status', 'ok');
    expect(data).toHaveProperty('timestamp');

    // Verify timestamp is a valid ISO date string
    const timestamp = data.timestamp;
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });
});
