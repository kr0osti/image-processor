import '../api/setup';
import { GET } from '../../app/api/serve-image/route';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// Mock fs and path modules
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

    // Mock readFile to return a buffer
    const imageBuffer = Buffer.from('test image data');
    readFile.mockResolvedValue(imageBuffer);

    // Create a mock request with a PNG filename
    const request = { url: 'http://localhost:3000/api/serve-image?file=test.png' };

    // Call the API handler
    const response = await GET(request);

    // Verify the response
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400');

    // Verify that readFile was called with the correct path
    expect(readFile).toHaveBeenCalledWith('/test/path/public/uploads/test.png');

    // Verify the response body
    const buffer = await response.arrayBuffer();
    expect(Buffer.from(buffer)).toEqual(imageBuffer);
  });

  it('should serve a JPEG image with the correct content type', async () => {
    // Mock existsSync to return true
    existsSync.mockReturnValue(true);

    // Mock readFile to return a buffer
    const imageBuffer = Buffer.from('test image data');
    readFile.mockResolvedValue(imageBuffer);

    // Create a mock request with a JPEG filename
    const request = { url: 'http://localhost:3000/api/serve-image?file=test.jpg' };

    // Call the API handler
    const response = await GET(request);

    // Verify the response
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');

    // Verify that readFile was called with the correct path
    expect(readFile).toHaveBeenCalledWith('/test/path/public/uploads/test.jpg');
  });

  it('should handle errors when reading the file', async () => {
    // Mock existsSync to return true
    existsSync.mockReturnValue(true);

    // Mock readFile to throw an error
    readFile.mockRejectedValue(new Error('Test error'));

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
