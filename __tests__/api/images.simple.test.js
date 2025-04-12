import { NextRequest } from 'next/server';
import { POST } from '../../app/api/images/route';

// Mock the dependencies
jest.mock('../../app/utils/rate-limit.js', () => ({
  createRateLimiter: jest.fn(() => jest.fn(() => null)),
}));

jest.mock('../../app/utils/cleanup', () => ({
  cleanupOldUploads: jest.fn(() => Promise.resolve({ deleted: 0 })),
}));

jest.mock('fs/promises', () => ({
  writeFile: jest.fn(() => Promise.resolve()),
  mkdir: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
}));

// Helper to create a mock request
const createMockRequest = (body, contentType = 'application/json') => {
  return new NextRequest('http://localhost:3000/api/images', {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
    },
    body: JSON.stringify(body),
  });
};

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

describe('Images API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the mocks
    require('fs').existsSync.mockImplementation(() => true);
    require('fs/promises').writeFile.mockImplementation(() => Promise.resolve());
  });

  it('should return 400 if no data URL is provided', async () => {
    const req = createMockRequest({ dataUrl: null });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.message).toBe('No data URL provided');
  });

  it('should return 400 if data URL format is invalid', async () => {
    const req = createMockRequest({ dataUrl: 'invalid-data-url' });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.message).toBe('Invalid data URL format');
  });
});
