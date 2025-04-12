import { GET } from '../../app/api/serve-image/route';

// Mock the fs/promises module
jest.mock('fs/promises', () => {
  return {
    readFile: jest.fn().mockResolvedValue(Buffer.from('test image data'))
  };
});

// Mock the fs module
jest.mock('fs', () => {
  return {
    existsSync: jest.fn().mockReturnValue(true)
  };
});

// Mock the path module
jest.mock('path', () => {
  return {
    join: jest.fn(),
    extname: jest.fn()
  };
});

// Mock NextResponse
jest.mock('next/server', () => {
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
      })
    },
    NextResponse: jest.fn().mockImplementation((body, init) => {
      return new MockResponse(body, init);
    })
  };
});

// Import mocks after they've been defined
import * as fsPromises from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';
import { NextResponse } from 'next/server';

// Mock console to avoid cluttering test output
global.console.error = jest.fn();

describe('Serve Image API', () => {
  beforeEach(() => {
    // Reset all mocks before each test
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
    fs.existsSync.mockReturnValue(false);

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
    fs.existsSync.mockReturnValue(true);

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
    fs.existsSync.mockReturnValue(true);

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
    fs.existsSync.mockReturnValue(true);

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
