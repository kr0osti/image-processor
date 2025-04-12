import '../api/setup';
import { GET } from '../../app/api/serve-image/route';
import * as fsPromises from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// Mock fs modules
jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue(Buffer.from('test image data')),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
}));

jest.mock('path', () => ({
  join: jest.fn(),
  extname: jest.fn(),
}));

// Mock NextResponse constructor
jest.mock('next/server', () => {
  const mockHeaders = new Map();
  
  class MockResponse {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status || 200;
      this.headers = new Map();
      
      // Add headers from init
      if (init.headers) {
        Object.entries(init.headers).forEach(([key, value]) => {
          this.headers.set(key, value);
        });
      }
    }
    
    json() {
      return Promise.resolve(this.body);
    }
    
    get(name) {
      return this.headers.get(name);
    }
  }
  
  return {
    NextResponse: {
      json: jest.fn((data, options) => {
        return new MockResponse(data, options);
      }),
    },
    NextResponse: jest.fn().mockImplementation((body, init) => {
      return new MockResponse(body, init);
    }),
  };
});

describe('Serve Image API', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Mock process.cwd() to return a fixed path
    jest.spyOn(process, 'cwd').mockReturnValue('/test/path');

    // Mock path.join to return a predictable path
    path.join.mockImplementation((...args) => args.join('/'));

    // Mock path.extname to return file extensions
    path.extname.mockImplementation((filename) => {
      const parts = filename.split('.');
      return parts.length > 1 ? `.${parts.pop()}` : '';
    });
  });

  it('should return 400 if no filename is provided', async () => {
    // Create a mock request without a filename
    const request = { url: 'http://localhost:3000/api/serve-image' };

    // Call the API handler
    const response = await GET(request);

    // Verify the response
    expect(response.status).toBe(400);

    // Parse the response body
    const data = await response.json();

    // Verify the response data
    expect(data).toEqual({ error: 'No filename provided' });
  });

  it('should return 404 if the file does not exist', async () => {
    // Mock existsSync to return false
    existsSync.mockReturnValue(false);

    // Create a mock request with a filename
    const request = { url: 'http://localhost:3000/api/serve-image?file=test.jpg' };

    // Call the API handler
    const response = await GET(request);

    // Verify the response
    expect(response.status).toBe(404);

    // Parse the response body
    const data = await response.json();

    // Verify the response data
    expect(data).toEqual({ error: 'File not found' });
  });

  it('should serve a PNG image with the correct content type', async () => {
    // Mock existsSync to return true
    existsSync.mockReturnValue(true);

    // Create a mock request with a PNG filename
    const request = { url: 'http://localhost:3000/api/serve-image?file=test.png' };

    // Call the API handler
    const response = await GET(request);

    // Verify the response headers
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400');

    // Verify that readFile was called with the correct path
    expect(fsPromises.readFile).toHaveBeenCalledWith('/test/path/public/uploads/test.png');
  });

  it('should serve a JPEG image with the correct content type', async () => {
    // Mock existsSync to return true
    existsSync.mockReturnValue(true);

    // Create a mock request with a JPEG filename
    const request = { url: 'http://localhost:3000/api/serve-image?file=test.jpg' };

    // Call the API handler
    const response = await GET(request);

    // Verify the response headers
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');

    // Verify that readFile was called with the correct path
    expect(fsPromises.readFile).toHaveBeenCalledWith('/test/path/public/uploads/test.jpg');
  });

  it('should handle errors when reading the file', async () => {
    // Mock existsSync to return true
    existsSync.mockReturnValue(true);

    // Mock readFile to throw an error
    fsPromises.readFile.mockRejectedValueOnce(new Error('Test error'));

    // Create a mock request with a filename
    const request = { url: 'http://localhost:3000/api/serve-image?file=test.jpg' };

    // Call the API handler
    const response = await GET(request);

    // Verify the response
    expect(response.status).toBe(500);

    // Parse the response body
    const data = await response.json();

    // Verify the response data
    expect(data).toEqual({ error: 'Failed to serve image' });
  });
});
