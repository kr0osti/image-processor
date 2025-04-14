// Mock NextRequest and NextResponse
class MockNextRequest {
  constructor(url) {
    this.url = url;
    this.nextUrl = new URL(url);
  }
}

class MockNextResponse {
  constructor(body, init = {}) {
    this.body = body;
    this.status = init.status || 200;
    this.headers = new Map(Object.entries(init.headers || {}));
  }

  json() {
    return Promise.resolve(this.body);
  }
}

// Mock next/server
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, options = {}) => {
      return new MockNextResponse(data, options);
    }),
  },
  NextRequest: MockNextRequest,
}));

import { GET } from '../../app/api/proxy/route';

// Mock the rate limiter
jest.mock('../../app/utils/rate-limit.js', () => ({
  createRateLimiter: jest.fn(() => jest.fn().mockResolvedValue(null)),
}));

// Mock global fetch
global.fetch = jest.fn();

describe('Proxy API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 400 if no URL is provided', async () => {
    // Create a mock request without URL parameter
    const request = new MockNextRequest('http://localhost:3000/api/proxy');

    // Call the API handler
    const response = await GET(request);

    // Verify the response
    expect(response.status).toBe(400);

    // Parse the response body
    const data = await response.json();

    // Verify the response data
    expect(data).toHaveProperty('error', 'URL parameter is required');
  });

  it('should fetch and return the image from the provided URL', async () => {
    // Mock successful fetch response
    const mockImageBuffer = Buffer.from('test image data');
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'image/jpeg']]),
      arrayBuffer: jest.fn().mockResolvedValue(mockImageBuffer),
    };
    global.fetch.mockResolvedValue(mockResponse);

    // Create a mock request with URL parameter
    const request = new MockNextRequest('http://localhost:3000/api/proxy?url=https://example.com/image.jpg');

    // Call the API handler
    const response = await GET(request);

    // Verify the response
    expect(response.status).toBe(200);

    // Verify that fetch was called with the correct URL and headers
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/image.jpg', expect.objectContaining({
      headers: expect.objectContaining({
        'User-Agent': expect.any(String),
        'Accept': expect.any(String),
        'Referer': 'https://example.com',
      }),
    }));

    // Verify response headers
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400');
  });

  it('should return error if fetch fails', async () => {
    // Mock failed fetch response
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    // Create a mock request with URL parameter
    const request = new MockNextRequest('http://localhost:3000/api/proxy?url=https://example.com/not-found.jpg');

    // Call the API handler
    const response = await GET(request);

    // Verify the response
    expect(response.status).toBe(404);

    // Parse the response body
    const data = await response.json();

    // Verify the response data
    expect(data).toHaveProperty('error', 'Failed to fetch image: Not Found');
  });
});
