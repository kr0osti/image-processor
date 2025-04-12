// Setup file for Node.js environment tests

// Mock environment variables
process.env.NEXT_PUBLIC_SITE_NAME = 'NextJS Image Processor Test';
process.env.NEXT_PUBLIC_SITE_DESCRIPTION = 'Test environment for image processing';
process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
process.env.CLEANUP_API_KEY = 'test-api-key';

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

// Mock next/server
jest.mock('next/server', () => {
  const mockJson = jest.fn((data, options = {}) => ({
    status: options.status || 200,
    headers: new Map(Object.entries(options.headers || {})),
    json: async () => data,
  }));

  const mockRedirect = jest.fn((url) => ({
    status: 302,
    headers: new Map([['Location', url]]),
  }));

  return {
    NextResponse: {
      json: mockJson,
      redirect: mockRedirect,
    },
  };
});

// Silence console output in tests
console.log = jest.fn();
console.error = jest.fn();
console.warn = jest.fn();
