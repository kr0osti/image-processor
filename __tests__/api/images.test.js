import { NextRequest } from 'next/server';
import { POST } from '../../app/api/images/route';
import { jest } from '@jest/globals';

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

// Mock crypto for deterministic testing
jest.mock('crypto', () => ({
  randomBytes: jest.fn(() => ({
    toString: jest.fn(() => 'test-filename'),
  })),
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

  it('should process a valid data URL and return success', async () => {
    // Valid data URL format
    const validDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const req = createMockRequest({ dataUrl: validDataUrl });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Image saved successfully');
    expect(data.url).toBe('/uploads/test-filename.png');
    expect(data.apiUrl).toBe('/api/serve-image?file=test-filename.png');
  });

  it('should handle file write errors', async () => {
    // Mock writeFile to throw an error
    require('fs/promises').writeFile.mockImplementation(() => {
      throw new Error('Write error');
    });

    const validDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const req = createMockRequest({ dataUrl: validDataUrl });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.message).toBe('Failed to save image');
    expect(data.error).toBe('Write error');
  });

  it('should handle directory creation errors', async () => {
    // Mock existsSync to return false and mkdir to throw an error
    require('fs').existsSync.mockImplementation(() => false);
    require('fs/promises').mkdir.mockImplementation(() => {
      throw new Error('Directory creation error');
    });

    const validDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const req = createMockRequest({ dataUrl: validDataUrl });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.message).toBe('Failed to process images');
    expect(data.error).toContain('Directory creation error');
  });

  // Test for timeout handling
  it('should handle timeouts gracefully', async () => {
    // Mock setTimeout to simulate a timeout
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;

    // Replace setTimeout to immediately trigger the timeout callback
    global.setTimeout = jest.fn((callback) => {
      callback();
      return 123; // Return a fake timeout ID
    });

    global.clearTimeout = jest.fn();

    try {
      const validDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const req = createMockRequest({ dataUrl: validDataUrl });

      // This should trigger our mocked timeout
      const response = await POST(req);
      const data = await response.json();

      // The test might not reach here if the timeout causes an unhandled rejection
      // But if it does, we should check the response
      expect(response.status).toBe(504);
      expect(data.success).toBe(false);
      expect(data.message).toContain('timed out');
    } finally {
      // Restore the original functions
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    }
  }, 10000); // Increase the test timeout
});
