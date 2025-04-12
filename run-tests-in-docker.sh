#!/bin/bash
# Script to run tests in the Docker container

# Check if the container is running
if ! docker ps | grep -q nextjs-image-processor-dev; then
  echo "Error: Container 'nextjs-image-processor-dev' is not running."
  echo "Please start the container first."
  exit 1
fi

# Create a simple Jest setup file
cat > jest.node.setup.js << 'EOL'
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
EOL

# Copy the setup file to the container
echo "Copying Jest setup file to container..."
docker cp jest.node.setup.js nextjs-image-processor-dev:/app/config/jest/jest.node.setup.js

# Run the tests
echo "Running tests..."
docker exec -it nextjs-image-processor-dev sh -c "cd /app && NODE_ENV=test-node npx jest __tests__/api/ --testEnvironment=node --detectOpenHandles --forceExit"

# Clean up
rm jest.node.setup.js

echo "Tests completed!"
