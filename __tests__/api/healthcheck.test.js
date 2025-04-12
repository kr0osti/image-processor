import '../api/setup';
import { GET } from '../../app/api/healthcheck/route';
import { NextRequest } from 'next/server';

// Mock the rate limiter
jest.mock('../../app/utils/rate-limit.js', () => ({
  createRateLimiter: jest.fn(() => jest.fn().mockResolvedValue(null)),
}));

describe('Healthcheck API', () => {
  it('should return a 200 status code', async () => {
    // Create a mock request
    const request = new NextRequest('http://localhost:3000/api/healthcheck');

    // Call the API handler
    const response = await GET(request);

    // Verify the response
    expect(response.status).toBe(200);

    // Parse the response body
    const data = await response.json();

    // Verify the response data
    expect(data).toHaveProperty('status', 'ok');
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('environment');
    expect(data).toHaveProperty('version');
  });
});
