/**
 * @jest-environment node
 */
import path from 'path';
import { POST, DELETE } from '../../app/api/images/route';
import { createDeleteToken, isValidDeleteToken } from '../../app/utils/delete-token';
// Use the global `jest`: next/jest's SWC transform only hoists jest.mock() above
// the imports for the global, so importing it from @jest/globals leaves mocks unapplied.

jest.mock('../../app/utils/rate-limit.js', () => ({
  createRateLimiter: jest.fn(() => jest.fn(() => null)),
}));

jest.mock('../../app/utils/cleanup', () => ({
  cleanupOldUploads: jest.fn(() => Promise.resolve({ deleted: 0 })),
}));

jest.mock('fs/promises', () => ({
  writeFile: jest.fn(() => Promise.resolve()),
  mkdir: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
}));

const createMockRequest = (body) => ({
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
  json: async () => body,
});

const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('delete tokens', () => {
  it('validates only the filename it was issued for', () => {
    const token = createDeleteToken('photo-processed.png');
    expect(isValidDeleteToken('photo-processed.png', token)).toBe(true);
    expect(isValidDeleteToken('other-processed.png', token)).toBe(false);
  });

  it('rejects malformed tokens', () => {
    expect(isValidDeleteToken('photo-processed.png', undefined)).toBe(false);
    expect(isValidDeleteToken('photo-processed.png', 'abc')).toBe(false);
    expect(isValidDeleteToken('photo-processed.png', 'z'.repeat(64))).toBe(false);
  });
});

describe('Images API delete', () => {
  const { unlink } = require('fs/promises');

  beforeEach(() => {
    jest.clearAllMocks();
    unlink.mockImplementation(() => Promise.resolve());
  });

  it('returns the filename and a delete token when saving', async () => {
    const response = await POST(createMockRequest({ dataUrl: PNG, originalFilename: 'shoe.png' }));
    const data = await response.json();

    expect(data.filename).toBe('shoe-processed.png');
    expect(isValidDeleteToken('shoe-processed.png', data.deleteToken)).toBe(true);
  });

  it('deletes files with valid tokens', async () => {
    const files = ['a-processed.png', 'b-processed.jpeg'].map((filename) => ({ filename, token: createDeleteToken(filename) }));
    const response = await DELETE(createMockRequest({ files }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true, deleted: 2, missing: 0, rejected: 0 });
    expect(unlink).toHaveBeenCalledWith(path.join(uploadsDir, 'a-processed.png'));
    expect(unlink).toHaveBeenCalledWith(path.join(uploadsDir, 'b-processed.jpeg'));
  });

  it('rejects files whose token does not match', async () => {
    const files = [{ filename: 'victim-processed.png', token: createDeleteToken('mine-processed.png') }];
    const data = await (await DELETE(createMockRequest({ files }))).json();

    expect(data).toEqual({ success: false, deleted: 0, missing: 0, rejected: 1 });
    expect(unlink).not.toHaveBeenCalled();
  });

  it.each(['../secret.png', 'dir/file.png', '.hidden', '', '..'])('never deletes unsafe name %p', async (filename) => {
    const data = await (await DELETE(createMockRequest({ files: [{ filename, token: createDeleteToken(filename) }] }))).json();

    expect(data.rejected).toBe(1);
    expect(unlink).not.toHaveBeenCalled();
  });

  it('counts files that are already gone as missing', async () => {
    unlink.mockImplementation(() => Promise.reject(Object.assign(new Error('gone'), { code: 'ENOENT' })));
    const files = [{ filename: 'old-processed.png', token: createDeleteToken('old-processed.png') }];
    const data = await (await DELETE(createMockRequest({ files }))).json();

    expect(data).toEqual({ success: true, deleted: 0, missing: 1, rejected: 0 });
  });

  it('rejects bodies without a files array or with too many entries', async () => {
    expect((await DELETE(createMockRequest({}))).status).toBe(400);
    expect((await DELETE(createMockRequest({ files: 'x' }))).status).toBe(400);
    const tooMany = Array.from({ length: 501 }, () => ({ filename: 'a.png', token: '' }));
    expect((await DELETE(createMockRequest({ files: tooMany }))).status).toBe(400);
  });

  it('rejects an invalid JSON body', async () => {
    const request = { headers: { get: () => 'application/json' }, json: async () => { throw new SyntaxError('bad'); } };
    expect((await DELETE(request)).status).toBe(400);
  });
});
