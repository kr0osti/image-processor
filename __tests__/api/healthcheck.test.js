/**
 * @jest-environment node
 */

// Mock the NextResponse
const mockJson = jest.fn((data) => ({
  status: 200,
  headers: new Map(),
  json: async () => data,
}));

// Mock next/server
jest.mock('next/server', () => ({
  NextResponse: {
    json: mockJson,
  },
  NextRequest: class NextRequest {
    constructor(url) {
      this.url = url;
      this.nextUrl = new URL(url);
    }
  },
}));

// Import the API route after mocking
import { GET } from '../../app/api/healthcheck/route';

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
    const request = new NextRequest('http://localhost:3000/api/healthcheck');

    // Call the API handler
    const response = await GET(request);

    // Verify the response
    expect(response.status).toBe(200);

    // Get the data passed to NextResponse.json
    const data = mockJson.mock.calls[0][0];

    // Verify the response data
    expect(data).toHaveProperty('status', 'ok');
    expect(data).toHaveProperty('timestamp');

    // Verify timestamp is a valid ISO date string
    const timestamp = data.timestamp;
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });
});
