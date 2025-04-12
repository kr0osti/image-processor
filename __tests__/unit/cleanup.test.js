import { cleanupOldUploads } from '../../app/utils/cleanup';
import path from 'path';

// Mock the fs/promises module
const mockReaddir = jest.fn();
const mockStat = jest.fn();
const mockUnlink = jest.fn();

jest.mock('fs/promises', () => ({
  readdir: mockReaddir,
  stat: mockStat,
  unlink: mockUnlink
}));

// Mock the fs module
const mockExistsSync = jest.fn();
jest.mock('fs', () => ({
  existsSync: mockExistsSync
}));

// Mock the path module
const mockJoin = jest.fn();
jest.mock('path', () => ({
  join: mockJoin
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
    mockJoin.mockImplementation((...args) => args.join('/'));
    
    // Mock fs.existsSync to return true by default
    mockExistsSync.mockReturnValue(true);
  });

  it('should return early if uploads directory does not exist', async () => {
    // Mock fs.existsSync to return false for this test
    mockExistsSync.mockReturnValue(false);

    const result = await cleanupOldUploads();

    expect(result).toEqual({ deleted: 0, errors: 0 });
    expect(mockReaddir).not.toHaveBeenCalled();
  });

  it('should delete files older than the specified age', async () => {
    // Mock the current time
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    // Mock readdir to return a list of files
    mockReaddir.mockResolvedValue(['file1.jpg', 'file2.png', '.gitkeep']);

    // Mock stat to return file stats
    // file1.jpg is older than maxAge, file2.png is newer
    mockStat.mockImplementation((filePath) => {
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

    // Mock unlink to resolve successfully
    mockUnlink.mockResolvedValue(undefined);

    // Run the cleanup with a maxAge of 1 hour
    const result = await cleanupOldUploads(60 * 60 * 1000);

    // Verify that only file1.jpg was deleted
    expect(mockUnlink).toHaveBeenCalledTimes(1);
    expect(mockUnlink).toHaveBeenCalledWith('/test/path/public/uploads/file1.jpg');
    expect(result).toEqual({ deleted: 1, errors: 0 });
  });

  it('should handle errors when processing files', async () => {
    // Mock readdir to return a list of files
    mockReaddir.mockResolvedValue(['file1.jpg', 'file2.png']);

    // Mock stat to throw an error for file1.jpg
    mockStat.mockImplementation((filePath) => {
      if (filePath.includes('file1')) {
        return Promise.reject(new Error('Test error'));
      } else {
        return Promise.resolve({
          mtimeMs: Date.now() - 2 * 60 * 60 * 1000, // 2 hours old
        });
      }
    });

    // Mock unlink to resolve successfully
    mockUnlink.mockResolvedValue(undefined);

    // Run the cleanup
    const result = await cleanupOldUploads();

    // Verify that file2.png was deleted and an error was recorded for file1.jpg
    expect(mockUnlink).toHaveBeenCalledTimes(1);
    expect(mockUnlink).toHaveBeenCalledWith('/test/path/public/uploads/file2.png');
    expect(result).toEqual({ deleted: 1, errors: 1 });
  });

  it('should handle errors when deleting files', async () => {
    // Mock readdir to return a list of files
    mockReaddir.mockResolvedValue(['file1.jpg']);

    // Mock stat to return old file stats
    mockStat.mockResolvedValue({
      mtimeMs: Date.now() - 2 * 60 * 60 * 1000, // 2 hours old
    });

    // Mock unlink to throw an error
    mockUnlink.mockRejectedValueOnce(new Error('Unlink error'));

    // Run the cleanup
    const result = await cleanupOldUploads();

    // Verify that an error was recorded
    expect(result).toEqual({ deleted: 0, errors: 1 });
  });

  it('should skip .gitkeep file', async () => {
    // Mock readdir to return a list of files including .gitkeep
    mockReaddir.mockResolvedValue(['file1.jpg', '.gitkeep']);

    // Mock stat to return old file stats
    mockStat.mockResolvedValue({
      mtimeMs: Date.now() - 2 * 60 * 60 * 1000, // 2 hours old
    });

    // Mock unlink to resolve successfully
    mockUnlink.mockResolvedValue(undefined);

    // Run the cleanup
    await cleanupOldUploads();

    // Verify that only file1.jpg was processed
    expect(mockStat).toHaveBeenCalledTimes(1);
    expect(mockStat).toHaveBeenCalledWith('/test/path/public/uploads/file1.jpg');
    // Verify that .gitkeep was not processed
    const statCalls = mockStat.mock.calls.map(call => call[0]);
    expect(statCalls).not.toContain('/test/path/public/uploads/.gitkeep');
  });
});
