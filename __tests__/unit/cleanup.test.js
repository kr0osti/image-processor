/**
 * @jest-environment node
 */

// Import the function to test
const { cleanupOldUploads } = require('../../app/utils/cleanup');

// Mock the fs module
jest.mock('fs', () => ({
  existsSync: jest.fn()
}));

// Mock the fs/promises module
jest.mock('fs/promises', () => ({
  readdir: jest.fn(),
  stat: jest.fn(),
  unlink: jest.fn()
}));

// Mock the path module
jest.mock('path', () => ({
  join: jest.fn()
}));

// Get the mocked modules
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');

// Silence console output
console.log = jest.fn();
console.error = jest.fn();

describe('Cleanup Utility', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock process.cwd()
    jest.spyOn(process, 'cwd').mockReturnValue('/test/path');

    // Set up default mock implementations
    path.join.mockImplementation((...args) => args.join('/'));
    fs.existsSync.mockReturnValue(true);
    fsPromises.readdir.mockResolvedValue([]);
    fsPromises.stat.mockResolvedValue({ mtimeMs: Date.now() });
    fsPromises.unlink.mockResolvedValue(undefined);
  });

  test('should return early if uploads directory does not exist', async () => {
    // Arrange
    fs.existsSync.mockReturnValue(false);

    // Act
    const result = await cleanupOldUploads();

    // Assert
    expect(result).toEqual({ deleted: 0, errors: 0 });
    expect(fsPromises.readdir).not.toHaveBeenCalled();
  });

  test('should delete files older than the specified age', async () => {
    // Arrange
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    fsPromises.readdir.mockResolvedValue(['file1.jpg', 'file2.png', '.gitkeep']);

    fsPromises.stat.mockImplementation((filePath) => {
      if (filePath.includes('file1')) {
        return Promise.resolve({ mtimeMs: now - 2 * 60 * 60 * 1000 }); // 2 hours old
      } else {
        return Promise.resolve({ mtimeMs: now - 30 * 60 * 1000 }); // 30 minutes old
      }
    });

    // Act
    const result = await cleanupOldUploads(60 * 60 * 1000); // 1 hour

    // Assert
    expect(fsPromises.unlink).toHaveBeenCalledTimes(1);
    expect(fsPromises.unlink).toHaveBeenCalledWith('/test/path/public/uploads/file1.jpg');
    expect(result).toEqual({ deleted: 1, errors: 0 });
  });
});
