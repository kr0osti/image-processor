#!/bin/bash
# Script to run the cleanup API tests

# Get the actual API key from the container's environment
API_KEY=$(docker exec -it nextjs-image-processor-dev sh -c "echo \$CLEANUP_API_KEY")

# If the API key is empty, use a default value
if [ -z "$API_KEY" ]; then
  API_KEY="dev-api-key"
  echo "Using default API key: $API_KEY"
else
  echo "Using API key from container environment"
fi

# Create a temporary file with the correct API key
cat > temp-cleanup-test.js << EOL
import { NextResponse } from 'next/server';
import { GET } from '../../app/api/cleanup/route';
import { jest } from '@jest/globals';

// Mock the cleanup utility
jest.mock('../../app/utils/cleanup', () => ({
  cleanupOldUploads: jest.fn(() => Promise.resolve({ deleted: 5, errors: 0 })),
}));

// Mock the rate limiter
jest.mock('../../app/utils/rate-limit.js', () => ({
  createRateLimiter: jest.fn(() => jest.fn(() => null)),
}));

// Set the API key to match the one in the container
process.env.CLEANUP_API_KEY = '$API_KEY';

describe('Cleanup API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 if no API key is provided', async () => {
    // Create a request without an API key
    const req = new NextRequest('http://localhost:3000/api/cleanup');
    
    // Call the API
    const response = await GET(req);
    
    // Verify the response
    expect(response.status).toBe(401);
    
    // Parse the response body
    const data = await response.json();
    
    // Verify the response body
    expect(data).toEqual({
      success: false,
      message: 'Unauthorized'
    });
  });

  it('should return 401 if an invalid API key is provided', async () => {
    // Create a request with an invalid API key
    const req = new NextRequest('http://localhost:3000/api/cleanup?apiKey=invalid-key');
    
    // Call the API
    const response = await GET(req);
    
    // Verify the response
    expect(response.status).toBe(401);
    
    // Parse the response body
    const data = await response.json();
    
    // Verify the response body
    expect(data).toEqual({
      success: false,
      message: 'Unauthorized'
    });
  });

  it('should run cleanup with default maxAge if a valid API key is provided', async () => {
    // Create a request with a valid API key
    const req = new NextRequest('http://localhost:3000/api/cleanup?apiKey=$API_KEY');
    
    // Call the API
    const response = await GET(req);
    
    // Verify the response
    expect(response.status).toBe(200);
    
    // Parse the response body
    const data = await response.json();
    
    // Verify the response body
    expect(data.success).toBe(true);
    expect(data.message).toContain('Cleanup complete');
    expect(data.deleted).toBe(5);
    expect(data.errors).toBe(0);
    
    // Verify that cleanupOldUploads was called with the default maxAge
    expect(require('../../app/utils/cleanup').cleanupOldUploads).toHaveBeenCalledWith(3600000);
  });

  it('should run cleanup with custom maxAge if provided', async () => {
    // Create a request with a valid API key and custom maxAge
    const req = new NextRequest('http://localhost:3000/api/cleanup?apiKey=$API_KEY&maxAge=7200000');
    
    // Call the API
    const response = await GET(req);
    
    // Verify the response
    expect(response.status).toBe(200);
    
    // Parse the response body
    const data = await response.json();
    
    // Verify the response body
    expect(data.success).toBe(true);
    expect(data.message).toContain('Cleanup complete');
    expect(data.deleted).toBe(5);
    expect(data.errors).toBe(0);
    
    // Verify that cleanupOldUploads was called with the custom maxAge
    expect(require('../../app/utils/cleanup').cleanupOldUploads).toHaveBeenCalledWith(7200000);
  });

  it('should handle errors during cleanup', async () => {
    // Mock cleanupOldUploads to throw an error
    require('../../app/utils/cleanup').cleanupOldUploads.mockImplementationOnce(() => {
      throw new Error('Test error');
    });
    
    // Create a request with a valid API key
    const req = new NextRequest('http://localhost:3000/api/cleanup?apiKey=$API_KEY');
    
    // Call the API
    const response = await GET(req);
    
    // Verify the response
    expect(response.status).toBe(500);
    
    // Parse the response body
    const data = await response.json();
    
    // Verify the response body
    expect(data.success).toBe(false);
    expect(data.message).toContain('Error during cleanup');
    expect(data.error).toBe('Test error');
  });
});
EOL

# Copy the test file into the container
docker cp temp-cleanup-test.js nextjs-image-processor-dev:/app/__tests__/api/cleanup.test.js

# Run the cleanup tests
docker exec -it nextjs-image-processor-dev sh -c "cd /app && NODE_ENV=test-node npx jest __tests__/api/cleanup.test.js --testEnvironment=node --detectOpenHandles --forceExit"

# Clean up
rm temp-cleanup-test.js
