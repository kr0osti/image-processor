const fs = require('fs');
const path = require('path');
beforeAll(() => {
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  fs.writeFileSync(path.join(uploadsDir, 'test.png'), 'test');
  fs.writeFileSync(path.join(uploadsDir, 'test.jpg'), 'test');
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

  afterAll(() => {
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    if (fs.existsSync(path.join(uploadsDir, 'test.png'))) fs.unlinkSync(path.join(uploadsDir, 'test.png'));
    if (fs.existsSync(path.join(uploadsDir, 'test.jpg'))) fs.unlinkSync(path.join(uploadsDir, 'test.jpg'));
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


});
