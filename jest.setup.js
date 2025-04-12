// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock the Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    pathname: '/',
    query: {},
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Define global Request and Headers if not already defined
if (typeof global.Request === 'undefined') {
  global.Request = class Request {
    constructor(url, options = {}) {
      this.url = url;
      this.method = options.method || 'GET';
      this.headers = new Headers(options.headers || {});
      this.body = options.body || null;
    }
  };
}

if (typeof global.Headers === 'undefined') {
  global.Headers = class Headers {
    constructor(init = {}) {
      this.headers = new Map();
      if (init) {
        Object.entries(init).forEach(([key, value]) => {
          this.headers.set(key.toLowerCase(), value);
        });
      }
    }

    get(name) {
      return this.headers.get(name.toLowerCase()) || null;
    }

    set(name, value) {
      this.headers.set(name.toLowerCase(), value);
    }

    has(name) {
      return this.headers.has(name.toLowerCase());
    }
  };
}

// Mock environment variables
process.env.NEXT_PUBLIC_SITE_NAME = 'NextJS Image Processor Test';
process.env.NEXT_PUBLIC_SITE_DESCRIPTION = 'Test environment for image processing';
process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
process.env.CLEANUP_API_KEY = 'test-api-key';

// We're using manual mocks for next/server in __mocks__/next/server.js

// Mock canvas for testing
global.HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
  fillRect: jest.fn(),
  clearRect: jest.fn(),
  getImageData: jest.fn(() => ({
    data: new Array(4).fill(0),
  })),
  putImageData: jest.fn(),
  createImageData: jest.fn(() => []),
  setTransform: jest.fn(),
  drawImage: jest.fn(),
  save: jest.fn(),
  restore: jest.fn(),
  scale: jest.fn(),
  rotate: jest.fn(),
  translate: jest.fn(),
  transform: jest.fn(),
  fillText: jest.fn(),
  measureText: jest.fn(() => ({ width: 0 })),
  fillStyle: 'white',
}));

// Mock crypto for testing
global.crypto = {
  randomBytes: jest.fn(() => ({
    toString: jest.fn(() => 'test-random-string'),
  })),
  subtle: {
    digest: jest.fn(),
  },
  getRandomValues: jest.fn(() => new Uint8Array(16)),
};

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = jest.fn(() => 'blob:test-url');
global.URL.revokeObjectURL = jest.fn();

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    blob: () => Promise.resolve(new Blob()),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  })
);
