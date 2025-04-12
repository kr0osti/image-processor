import { cleanupOldUploads } from '../../app/utils/cleanup';
import fs from 'fs';
import path from 'path';

// Mock fs and path modules
jest.mock('fs', () => {
  const originalModule = jest.requireActual('fs');
  return {
    ...originalModule,
    existsSync: jest.fn(),
    promises: {
      readdir: jest.fn(),
      stat: jest.fn(),
      unlink: jest.fn().mockResolvedValue(undefined),
    },
  };
});

jest.mock('path', () => {
  const originalModule = jest.requireActual('path');
  return {
    ...originalModule,
    join: jest.fn(),
  };
});

// Mock console.log and console.error to avoid cluttering test output
global.console.log = jest.fn();
global.console.error = jest.fn();

describe('Cleanup Utility', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Mock process.cwd() to return a fixed path
    jest.spyOn(process, 'cwd').mockReturnValue('/test/path');

    // Mock path.join to return a predictable path
    path.join.mockImplementation((...args) => args.join('/'));

    // Mock fs.existsSync to return true by default
    fs.existsSync.mockReturnValue(true);
  });

  it('should return early if uploads directory does not exist', async () => {
    // Mock fs.existsSync to return false for this test
    fs.existsSync.mockReturnValue(false);

    const result = await cleanupOldUploads();

    expect(result).toEqual({ deleted: 0, errors: 0 });
    expect(fs.promises.readdir).not.toHaveBeenCalled();
  });

  it('should delete files older than the specified age', async () => {
    // Mock the current time
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    // Mock fs.promises.readdir to return a list of files
    fs.promises.readdir.mockResolvedValue(['file1.jpg', 'file2.png', '.gitkeep']);

    // Mock fs.promises.stat to return file stats
    // file1.jpg is older than maxAge, file2.png is newer
    fs.promises.stat.mockImplementation((filePath) => {
      if (filePath.includes('file1')) {
        return Promise.resolve({
          mtimeMs: now - 2 * 60 * 60 * 1000, // 2 hours old
        });
      } else {
        return Promise.resolve({
          mtimeMs: now - 30 * 60 * 1000, // 30 minutes old
        });
      }
    });

    // Run the cleanup with a maxAge of 1 hour
    const result = await cleanupOldUploads(60 * 60 * 1000);

    // Verify that only file1.jpg was deleted
    expect(fs.promises.unlink).toHaveBeenCalledTimes(1);
    expect(fs.promises.unlink).toHaveBeenCalledWith('/test/path/public/uploads/file1.jpg');
    expect(result).toEqual({ deleted: 1, errors: 0 });
  });

  it('should handle errors when processing files', async () => {
    // Mock fs.promises.readdir to return a list of files
    fs.promises.readdir.mockResolvedValue(['file1.jpg', 'file2.png']);

    // Mock fs.promises.stat to throw an error for file1.jpg
    fs.promises.stat.mockImplementation((filePath) => {
      if (filePath.includes('file1')) {
        return Promise.reject(new Error('Test error'));
      } else {
        return Promise.resolve({
          mtimeMs: Date.now() - 2 * 60 * 60 * 1000, // 2 hours old
        });
      }
    });

    // Run the cleanup
    const result = await cleanupOldUploads();

    // Verify that file2.png was deleted and an error was recorded for file1.jpg
    expect(fs.promises.unlink).toHaveBeenCalledTimes(1);
    expect(fs.promises.unlink).toHaveBeenCalledWith('/test/path/public/uploads/file2.png');
    expect(result).toEqual({ deleted: 1, errors: 1 });
  });

  it('should handle errors when deleting files', async () => {
    // Mock fs.promises.readdir to return a list of files
    fs.promises.readdir.mockResolvedValue(['file1.jpg']);

    // Mock fs.promises.stat to return old file stats
    fs.promises.stat.mockResolvedValue({
      mtimeMs: Date.now() - 2 * 60 * 60 * 1000, // 2 hours old
    });

    // Mock fs.promises.unlink to throw an error
    fs.promises.unlink.mockRejectedValue(new Error('Unlink error'));

    // Run the cleanup
    const result = await cleanupOldUploads();

    // Verify that an error was recorded
    expect(result).toEqual({ deleted: 0, errors: 1 });
  });

  it('should skip .gitkeep file', async () => {
    // Mock fs.promises.readdir to return a list of files including .gitkeep
    fs.promises.readdir.mockResolvedValue(['file1.jpg', '.gitkeep']);

    // Mock fs.promises.stat to return old file stats
    fs.promises.stat.mockResolvedValue({
      mtimeMs: Date.now() - 2 * 60 * 60 * 1000, // 2 hours old
    });

    // Run the cleanup
    await cleanupOldUploads();

    // Verify that only file1.jpg was processed
    expect(fs.promises.stat).toHaveBeenCalledTimes(1);
    expect(fs.promises.stat).toHaveBeenCalledWith('/test/path/public/uploads/file1.jpg');
    expect(fs.promises.stat).not.toHaveBeenCalledWith('/test/path/public/uploads/.gitkeep');
  });
});
