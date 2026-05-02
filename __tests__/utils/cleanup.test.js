const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const { cleanupOldUploads } = require('../../app/utils/cleanup');

describe('Cleanup Utility', () => {
  let tmpDir;
  let originalCwd;

  beforeAll(() => {
    tmpDir = path.join(__dirname, 'tmp-uploads');
    originalCwd = process.cwd;
    process.cwd = () => path.join(__dirname, 'tmp');
  });

  afterAll(() => {
    process.cwd = originalCwd;
    if (fs.existsSync(path.join(__dirname, 'tmp'))) {
      fs.rmSync(path.join(__dirname, 'tmp'), { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    const dir = path.join(__dirname, 'tmp', 'public', 'uploads');
    if (fs.existsSync(path.join(__dirname, 'tmp'))) {
      fs.rmSync(path.join(__dirname, 'tmp'), { recursive: true, force: true });
    }
    fs.mkdirSync(dir, { recursive: true });
  });

  it('should skip cleanup if uploads directory does not exist', async () => {
    fs.rmSync(path.join(__dirname, 'tmp', 'public', 'uploads'), { recursive: true, force: true });
    const result = await cleanupOldUploads();
    expect(result).toEqual({ deleted: 0, errors: 0 });
  });

  it('should not delete files newer than the specified age', async () => {
    const dir = path.join(__dirname, 'tmp', 'public', 'uploads');
    fs.writeFileSync(path.join(dir, 'file1.jpg'), 'test');
    const result = await cleanupOldUploads(60 * 60 * 1000);
    expect(result).toEqual({ deleted: 0, errors: 0 });
    expect(fs.existsSync(path.join(dir, 'file1.jpg'))).toBe(true);
  });
});
