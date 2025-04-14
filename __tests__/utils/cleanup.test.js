import { cleanupOldUploads } from '../../app/utils/cleanup';
import fs from 'fs';
import path from 'path';
import { readdir, stat, unlink } from 'fs/promises';

// Mock the fs modules
jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  readdir: jest.fn(),
  stat: jest.fn(),
  unlink: jest.fn(),
}));

jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
}));

describe('Cleanup Utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up default mock implementations
    fs.existsSync.mockReturnValue(true);
    readdir.mockResolvedValue(['file1.jpg', 'file2.png', 'file3.webp']);
    
    // Mock process.cwd()
    jest.spyOn(process, 'cwd').mockReturnValue('/test/path');
  });

  it('should skip cleanup if uploads directory does not exist', async () => {
    // Mock existsSync to return false
    fs.existsSync.mockReturnValue(false);

    const result = await cleanupOldUploads();

    expect(result).toEqual({ deleted: 0, errors: 0 });
    expect(readdir).not.toHaveBeenCalled();
  });

  it('should delete files older than the specified age', async () => {
    // Current time for testing
    const now = new Date();
    
    // Mock file stats
    const oldFileTime = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours old
    const newFileTime = new Date(now.getTime() - 30 * 60 * 1000); // 30 minutes old
    
    // Mock stat to return different times for different files
    stat.mockImplementation((filePath) => {
      if (filePath.includes('file1.jpg') || filePath.includes('file3.webp')) {
        return Promise.resolve({
          mtime: oldFileTime,
        });
      } else {
        return Promise.resolve({
          mtime: newFileTime,
        });
      }
    });
    
    // Mock successful unlink
    unlink.mockResolvedValue(undefined);

    // Run cleanup with 1 hour max age
    const result = await cleanupOldUploads(60 * 60 * 1000);

    // Should delete file1.jpg and file3.webp (2 hours old)
    expect(result).toEqual({ deleted: 2, errors: 0 });
    expect(unlink).toHaveBeenCalledTimes(2);
    expect(unlink).toHaveBeenCalledWith('/test/path/public/uploads/file1.jpg');
    expect(unlink).toHaveBeenCalledWith('/test/path/public/uploads/file3.webp');
  });

  it('should handle errors during file deletion', async () => {
    // Mock file stats to make all files old
    stat.mockResolvedValue({
      mtime: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours old
    });
    
    // Mock unlink to throw an error for one file
    unlink.mockImplementation((filePath) => {
      if (filePath.includes('file2.png')) {
        return Promise.reject(new Error('Permission denied'));
      }
      return Promise.resolve();
    });

    // Run cleanup
    const result = await cleanupOldUploads();

    // Should have 2 successful deletions and 1 error
    expect(result).toEqual({ deleted: 2, errors: 1 });
    expect(unlink).toHaveBeenCalledTimes(3);
  });

  it('should not delete files newer than the specified age', async () => {
    // Mock all files to be new
    stat.mockResolvedValue({
      mtime: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes old
    });

    // Run cleanup with 1 hour max age
    const result = await cleanupOldUploads(60 * 60 * 1000);

    // Should not delete any files
    expect(result).toEqual({ deleted: 0, errors: 0 });
    expect(unlink).not.toHaveBeenCalled();
  });
});
