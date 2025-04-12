#!/bin/bash
# Script to run all API tests

# Copy the updated images test file into the container
docker cp __tests__/api/images.test.js nextjs-image-processor-dev:/app/__tests__/api/images.test.js

# Create a temporary file to fix the cleanup test
cat > temp-cleanup-test.js << 'EOL'
import { NextRequest } from 'next/server';
import { GET } from '../../app/api/cleanup/route';
import { jest } from '@jest/globals';

// Mock the cleanup utility
jest.mock('../../app/utils/cleanup', () => ({
  cleanupOldUploads: jest.fn(() => Promise.resolve({ deleted: 5, errors: 0 })),
}));

// Mock environment variables
process.env.CLEANUP_API_KEY = 'test-api-key';

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
    expect(data.success).toBe(false);
    expect(data.message).toBe('Unauthorized');
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
    expect(data.success).toBe(false);
    expect(data.message).toBe('Unauthorized');
  });

  it('should run cleanup with default maxAge if a valid API key is provided', async () => {
    // Create a request with a valid API key
    const req = new NextRequest('http://localhost:3000/api/cleanup?apiKey=test-api-key');
    
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
    const req = new NextRequest('http://localhost:3000/api/cleanup?apiKey=test-api-key&maxAge=7200000');
    
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
    const req = new NextRequest('http://localhost:3000/api/cleanup?apiKey=test-api-key');
    
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

# Copy the fixed cleanup test file into the container
docker cp temp-cleanup-test.js nextjs-image-processor-dev:/app/__tests__/api/cleanup.test.js

# Run all API tests
docker exec -it nextjs-image-processor-dev sh -c "cd /app && NODE_ENV=test-node npx jest __tests__/api/ --testEnvironment=node --detectOpenHandles --forceExit"

# Clean up
rm temp-cleanup-test.js
