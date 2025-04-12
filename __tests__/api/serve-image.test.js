/**
 * @jest-environment node
 */

// Mock the NextResponse before importing the route
const mockJson = jest.fn();
const mockNextResponse = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: mockJson
  }
}));

// Mock fs modules
jest.mock('fs', () => ({
  existsSync: jest.fn()
}));

jest.mock('fs/promises', () => ({
  readFile: jest.fn()
}));

jest.mock('path', () => ({
  join: jest.fn(),
  extname: jest.fn()
}));

// Import the function to test after mocking
const { GET } = require('../../app/api/serve-image/route');

// Get the mocked modules
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');

// Silence console output
console.error = jest.fn();

describe('Serve Image API', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Set up default mock implementations
    mockJson.mockImplementation((data, options) => ({
      status: options?.status || 200,
      headers: new Map(Object.entries(options?.headers || {})),
      json: async () => data
    }));

    mockNextResponse.mockImplementation((body, init) => ({
      status: init?.status || 200,
      headers: new Map(Object.entries(init?.headers || {})),
      body
    }));

    path.join.mockImplementation((...args) => args.join('/'));
    path.extname.mockImplementation((filename) => {
      const parts = filename.split('.');
      return parts.length > 1 ? `.${parts.pop()}` : '';
    });

    fs.existsSync.mockReturnValue(true);
    fsPromises.readFile.mockResolvedValue(Buffer.from('test image data'));

    // Mock process.cwd()
    jest.spyOn(process, 'cwd').mockReturnValue('/test/path');
  });

  test('should return 400 if no filename is provided', async () => {
    // Arrange
    const request = { url: 'http://localhost:3000/api/serve-image' };

    // Act
    await GET(request);

    // Assert
    expect(mockJson).toHaveBeenCalledWith(
      { error: 'No filename provided' },
      { status: 400 }
    );
  });

  test('should return 404 if the file does not exist', async () => {
    // Arrange
    const request = { url: 'http://localhost:3000/api/serve-image?file=test.jpg' };
    fs.existsSync.mockReturnValue(false);

    // Act
    await GET(request);

    // Assert
    expect(mockJson).toHaveBeenCalledWith(
      { error: 'File not found' },
      { status: 404 }
    );
  });
});
