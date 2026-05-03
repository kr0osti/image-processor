
if (typeof Request === "undefined") { global.Request = class Request {}; }
const { GET } = require('../../app/api/cleanup/route');
const { cleanupOldUploads } = require('../../app/utils/cleanup');

jest.mock('../../app/utils/cleanup', () => ({
  cleanupOldUploads: jest.fn(),
}));

jest.mock('../../app/utils/rate-limit.js', () => ({
  createRateLimiter: jest.fn(() => jest.fn().mockResolvedValue(null)),
}));

jest.mock('next/server', () => {
  const mockJson = jest.fn((data, options = {}) => ({ status: options.status || 200, headers: new Map(), json: async () => data }));
  return {
    NextResponse: {
      json: mockJson
    }
  };
});

const { NextResponse } = require('next/server');

describe('Cleanup API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CLEANUP_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.CLEANUP_API_KEY;
  });

  it('should return 401 if no API key is provided', async () => {
    const request = { url: 'http://localhost:3000/api/cleanup', searchParams: new URL('http://localhost:3000/api/cleanup').searchParams };
    const response = await GET(request);
    expect(response.status).toBe(401);
    const data = NextResponse.json.mock.calls[0][0];
    expect(data).toEqual({ error: 'Unauthorized' });
    expect(cleanupOldUploads).not.toHaveBeenCalled();
  });

  it('should return 401 if an invalid API key is provided', async () => {
    const request = { url: 'http://localhost:3000/api/cleanup?key=invalid-key', searchParams: new URL('http://localhost:3000/api/cleanup?key=invalid-key').searchParams };
    const response = await GET(request);
    expect(response.status).toBe(401);
    const data = NextResponse.json.mock.calls[0][0];
    expect(data).toEqual({ error: 'Unauthorized' });
    expect(cleanupOldUploads).not.toHaveBeenCalled();
  });

  it('should run cleanup with default maxAge if a valid API key is provided', async () => {
    cleanupOldUploads.mockResolvedValue({ deleted: 5, errors: 0 });
    const request = { url: 'http://localhost:3000/api/cleanup?key=test-api-key', searchParams: new URL('http://localhost:3000/api/cleanup?key=test-api-key').searchParams };
    const response = await GET(request);
    expect(response.status).toBe(200);
    const data = NextResponse.json.mock.calls[0][0];
    expect(data.deleted).toBe(5);
    expect(cleanupOldUploads).toHaveBeenCalledWith(60 * 60 * 1000);
  });

  it('should run cleanup with custom maxAge if provided', async () => {
    cleanupOldUploads.mockResolvedValue({ deleted: 3, errors: 1 });
    const request = { url: 'http://localhost:3000/api/cleanup?key=test-api-key&maxAge=30', searchParams: new URL('http://localhost:3000/api/cleanup?key=test-api-key&maxAge=30').searchParams };
    const response = await GET(request);
    expect(response.status).toBe(200);
    const data = NextResponse.json.mock.calls[0][0];
    expect(data.deleted).toBe(3);
    expect(cleanupOldUploads).toHaveBeenCalledWith(30 * 60 * 1000);
  });

  it('should handle errors during cleanup', async () => {
    cleanupOldUploads.mockRejectedValue(new Error('Test error'));
    const request = { url: 'http://localhost:3000/api/cleanup?key=test-api-key', searchParams: new URL('http://localhost:3000/api/cleanup?key=test-api-key').searchParams };
    const response = await GET(request);
    expect(response.status).toBe(500);
    const data = NextResponse.json.mock.calls[0][0];
    expect(data.error).toBe('Test error');
  });
});
