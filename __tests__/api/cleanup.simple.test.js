import { NextRequest } from 'next/server';
import { GET } from '../../app/api/cleanup/route';

// Mock the cleanup utility
jest.mock('../../app/utils/cleanup', () => ({
  cleanupOldUploads: jest.fn(() => Promise.resolve({ deleted: 5, errors: 0 })),
}));

// Mock the rate limiter
jest.mock('../../app/utils/rate-limit.js', () => ({
  createRateLimiter: jest.fn(() => jest.fn(() => null)),
}));

// Mock the NextResponse
jest.mock('next/server', () => {
  const mockJson = jest.fn((data, options = {}) => ({
    status: options.status || 200,
    headers: new Map(Object.entries(options.headers || {})),
    json: async () => data,
  }));

  return {
    NextResponse: {
      json: mockJson,
    },
  };
});

// Set environment variables
process.env.CLEANUP_API_KEY = 'test-api-key';

describe('Cleanup API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 if no API key is provided', async () => {
    // Create a request without an API key
    const req = new NextRequest('http://localhost:3000/api/cleanup');
    
    // Call the API
    const response = await GET(req);
    
    // Verify the response
    expect(response.status).toBe(401);
  });
});
