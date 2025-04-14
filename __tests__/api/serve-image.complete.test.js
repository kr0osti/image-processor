/**
 * @jest-environment node
 */

// Mock NextResponse
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
}));

// Import real modules after mocking
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// Mock the dependencies
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

jest.mock('path', () => ({
  join: jest.fn(),
  extname: jest.fn(),
}));

// Import the function to test after mocking
import { GET } from '../../app/api/serve-image/route';

describe('Serve Image API', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Set up default mock implementations
    existsSync.mockReturnValue(true);
    readFile.mockResolvedValue(Buffer.from('test image data'));
    path.join.mockImplementation((...args) => args.join('/'));
    path.extname.mockReturnValue('.png');

    // Mock process.cwd()
    jest.spyOn(process, 'cwd').mockReturnValue('/test/path');
  });

  it('should return 400 if no filename is provided', async () => {
    // Create a mock request without filename
    const request = { url: 'http://localhost:3000/api/serve-image' };

    // Call the API handler
    const response = await GET(request);

    // Verify the response
    expect(response.status).toBe(400);

    // Parse the response body
    const data = await response.json();

    // Verify the response data
    expect(data).toHaveProperty('error', 'No filename provided');
  });

  it('should return 404 if file does not exist', async () => {
    // Mock existsSync to return false
    existsSync.mockReturnValue(false);

    // Create a mock request with filename
    const request = { url: 'http://localhost:3000/api/serve-image?file=test.png' };

    // Call the API handler
    const response = await GET(request);

    // Verify the response
    expect(response.status).toBe(404);

    // Parse the response body
    const data = await response.json();

    // Verify the response data
    expect(data).toHaveProperty('error', 'File not found');
  });

  it('should serve PNG image with correct content type', async () => {
    // Mock path.extname to return .png
    path.extname.mockReturnValue('.png');

    // Create a mock request with filename
    const request = { url: 'http://localhost:3000/api/serve-image?file=test.png' };

    // Call the API handler
    const response = await GET(request);

    // Verify the response headers
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400');
  });

  it('should serve JPEG image with correct content type', async () => {
    // Mock path.extname to return .jpg
    path.extname.mockReturnValue('.jpg');

    // Create a mock request with filename
    const request = { url: 'http://localhost:3000/api/serve-image?file=test.jpg' };

    // Call the API handler
    const response = await GET(request);

    // Verify the response headers
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400');
  });

  it('should handle file read errors', async () => {
    // Mock readFile to throw an error
    readFile.mockRejectedValue(new Error('Read error'));

    // Create a mock request with filename
    const request = { url: 'http://localhost:3000/api/serve-image?file=test.png' };

    // Call the API handler
    const response = await GET(request);

    // Verify the response
    expect(response.status).toBe(500);

    // Parse the response body
    const data = await response.json();

    // Verify the response data
    expect(data).toHaveProperty('error', 'Failed to serve image');
  });
});
