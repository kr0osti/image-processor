import { cleanupOldUploads } from '../../app/utils/cleanup';
import * as fsPromises from 'fs/promises';
import * as fs from 'fs';
import path from 'path';

// Mock fs/promises module
jest.mock('fs/promises', () => ({
  readdir: jest.fn(),
  stat: jest.fn(),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

// Mock path module
jest.mock('path', () => ({
  join: jest.fn(),
}));

// Mock console to avoid cluttering test output
global.console.log = jest.fn();
global.console.error = jest.fn();

describe('Cleanup Utility', () => {
  beforeEach(() => {
    // Reset all mocks before each test
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
    expect(fsPromises.readdir).not.toHaveBeenCalled();
  });

  it('should delete files older than the specified age', async () => {
    // Mock the current time
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    // Mock readdir to return a list of files
    fsPromises.readdir.mockResolvedValue(['file1.jpg', 'file2.png', '.gitkeep']);

    // Mock stat to return file stats
    // file1.jpg is older than maxAge, file2.png is newer
    fsPromises.stat.mockImplementation((filePath) => {
      if (filePath.includes('file1')) {
        return Promise.resolve({
          mtimeMs: now - 2 * 60 * 60 * 1000, // 2 hours old
        });
      } else if (filePath.includes('file2')) {
        return Promise.resolve({
          mtimeMs: now - 30 * 60 * 1000, // 30 minutes old
        });
      }
      return Promise.reject(new Error('Unexpected file path'));
    });

    // Run the cleanup with a maxAge of 1 hour
    const result = await cleanupOldUploads(60 * 60 * 1000);

    // Verify that only file1.jpg was deleted
    expect(fsPromises.unlink).toHaveBeenCalledTimes(1);
    expect(fsPromises.unlink).toHaveBeenCalledWith('/test/path/public/uploads/file1.jpg');
    expect(result).toEqual({ deleted: 1, errors: 0 });
  });

  it('should handle errors when processing files', async () => {
    // Mock readdir to return a list of files
    fsPromises.readdir.mockResolvedValue(['file1.jpg', 'file2.png']);

    // Mock stat to throw an error for file1.jpg
    fsPromises.stat.mockImplementation((filePath) => {
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
    expect(fsPromises.unlink).toHaveBeenCalledTimes(1);
    expect(fsPromises.unlink).toHaveBeenCalledWith('/test/path/public/uploads/file2.png');
    expect(result).toEqual({ deleted: 1, errors: 1 });
  });

  it('should handle errors when deleting files', async () => {
    // Mock readdir to return a list of files
    fsPromises.readdir.mockResolvedValue(['file1.jpg']);

    // Mock stat to return old file stats
    fsPromises.stat.mockResolvedValue({
      mtimeMs: Date.now() - 2 * 60 * 60 * 1000, // 2 hours old
    });

    // Mock unlink to throw an error
    fsPromises.unlink.mockRejectedValueOnce(new Error('Unlink error'));

    // Run the cleanup
    const result = await cleanupOldUploads();

    // Verify that an error was recorded
    expect(result).toEqual({ deleted: 0, errors: 1 });
  });

  it('should skip .gitkeep file', async () => {
    // Mock readdir to return a list of files including .gitkeep
    fsPromises.readdir.mockResolvedValue(['file1.jpg', '.gitkeep']);

    // Mock stat to return old file stats
    fsPromises.stat.mockResolvedValue({
      mtimeMs: Date.now() - 2 * 60 * 60 * 1000, // 2 hours old
    });

    // Run the cleanup
    await cleanupOldUploads();

    // Verify that only file1.jpg was processed
    expect(fsPromises.stat).toHaveBeenCalledTimes(1);
    expect(fsPromises.stat).toHaveBeenCalledWith('/test/path/public/uploads/file1.jpg');
    expect(fsPromises.stat).not.toHaveBeenCalledWith('/test/path/public/uploads/.gitkeep');
  });
});
