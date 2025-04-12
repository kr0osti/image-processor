// Mock Next.js Request and Response
global.Request = class Request {
  constructor(url, options = {}) {
    this.url = url;
    this.method = options.method || 'GET';
    this.headers = new Headers(options.headers || {});
    this.body = options.body || null;
  }
};

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

  delete(name) {
    this.headers.delete(name.toLowerCase());
  }

  append(name, value) {
    const key = name.toLowerCase();
    if (this.headers.has(key)) {
      this.headers.set(key, `${this.headers.get(key)}, ${value}`);
    } else {
      this.headers.set(key, value);
    }
  }

  forEach(callback, thisArg) {
    this.headers.forEach((value, key) => {
      callback.call(thisArg, value, key, this);
    });
  }

  entries() {
    return this.headers.entries();
  }

  keys() {
    return this.headers.keys();
  }

  values() {
    return this.headers.values();
  }
};

// Mock NextRequest and NextResponse
jest.mock('next/server', () => {
  class MockNextResponse {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status || 200;
      this.headers = new Map(Object.entries(init.headers || {}));
    }

    json() {
      return Promise.resolve(this.body);
    }

    arrayBuffer() {
      return Promise.resolve(this.body);
    }

    get(name) {
      return this.headers.get(name);
    }
  }

  const NextResponseMock = jest.fn().mockImplementation((body, init) => {
    return new MockNextResponse(body, init);
  });

  NextResponseMock.json = jest.fn((data, options) => {
    return new MockNextResponse(data, options);
  });

  NextResponseMock.redirect = jest.fn((url) => {
    const response = new MockNextResponse(null, { status: 302 });
    response.headers.set('Location', url);
    return response;
  });

  return {
    NextResponse: NextResponseMock,
    NextRequest: class NextRequest extends global.Request {
      constructor(url, options = {}) {
        super(url, options);
        this.nextUrl = new URL(url);
      }

      get cookies() {
        return {
          get: jest.fn(),
          getAll: jest.fn(),
          set: jest.fn(),
          delete: jest.fn(),
          has: jest.fn(),
          clear: jest.fn(),
        };
      }
    },
  };
});
