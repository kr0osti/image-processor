const fs = require('fs');
const path = require('path');
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
beforeAll(() => {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  fs.writeFileSync(path.join(uploadsDir, 'test.png'), 'test');
  fs.writeFileSync(path.join(uploadsDir, 'test.jpg'), 'test');
  fs.writeFileSync(path.join(uploadsDir, "l'été (1).png"), 'test');
});
// Remove the fixtures so test runs leave public/uploads as they found it
afterAll(() => {
  fs.rmSync(path.join(uploadsDir, 'test.png'), { force: true });
  fs.rmSync(path.join(uploadsDir, 'test.jpg'), { force: true });
  fs.rmSync(path.join(uploadsDir, "l'été (1).png"), { force: true });
});
if (typeof Request === "undefined") { global.Request = class Request {}; }
/**
 * @jest-environment node
 */

const { GET } = require('../../app/api/serve-image/route');

jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
  extname: jest.fn((file) => {
    if (file.endsWith('.png')) return '.png';
    if (file.endsWith('.jpg')) return '.jpg';
    return '';
  }),
  basename: jest.fn((file) => file.split('/').pop())
}));

jest.mock('next/server', () => ({
  NextResponse: class MockNextResponse {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status || 200;
      this.headers = new Map(Object.entries(init.headers || {}));
    }
    json() {
      return Promise.resolve(this.body);
    }
    static json(data, options = {}) {
      return new MockNextResponse(data, options);
    }
  }
}));

describe('Serve Image API', () => {
  beforeEach(() => {
    jest.clearAllMocks();

  });

  it('should return 400 if no filename is provided', async () => {
    const request = { url: 'http://localhost:3000/api/serve-image' };
    const response = await GET(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('No filename provided');
  });

  it('should return 404 if file does not exist', async () => {
        const request = { url: 'http://localhost:3000/api/serve-image?file=missing.png' };
    const response = await GET(request);
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('File not found');
  });

  it('should serve PNG image with correct content type', async () => {
    const request = { url: 'http://localhost:3000/api/serve-image?file=test.png' };
    const response = await GET(request);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400');
  });

  it('should serve JPEG image with correct content type', async () => {
    const request = { url: 'http://localhost:3000/api/serve-image?file=test.jpg' };
    const response = await GET(request);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400');
  });

  it('shows the image inline by default', async () => {
    const response = await GET({ url: 'http://localhost:3000/api/serve-image?file=test.png' });
    expect(response.headers.has('Content-Disposition')).toBe(false);
  });

  it('asks the browser to download it with download=1', async () => {
    for (const value of ['1', 'true', 'yes']) {
      const response = await GET({ url: `http://localhost:3000/api/serve-image?file=test.png&download=${value}` });
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Disposition')).toBe(
        `attachment; filename="test.png"; filename*=UTF-8''test.png`,
      );
    }
    const off = await GET({ url: 'http://localhost:3000/api/serve-image?file=test.png&download=0' });
    expect(off.headers.has('Content-Disposition')).toBe(false);
  });

  it('encodes names with quotes and accents for download', async () => {
    const response = await GET({
      url: `http://localhost:3000/api/serve-image?file=${encodeURIComponent("l'été (1).png")}&download=1`,
    });
    expect(response.headers.get('Content-Disposition')).toBe(
      `attachment; filename="l'_t_ (1).png"; filename*=UTF-8''l%27%C3%A9t%C3%A9%20%281%29.png`,
    );
  });

});
