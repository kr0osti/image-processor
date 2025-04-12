import '../api/setup';
import { GET } from '../../app/api/cleanup/route';
import { cleanupOldUploads } from '../../app/utils/cleanup';
import { NextResponse } from 'next/server';

// Mock the cleanup utility
jest.mock('../../app/utils/cleanup', () => ({
  cleanupOldUploads: jest.fn(),
}));

// Mock the rate limiter
jest.mock('../../app/utils/rate-limit.js', () => ({
  createRateLimiter: jest.fn(() => jest.fn().mockResolvedValue(null)),
}));

describe('Cleanup API', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should return 401 if no API key is provided', async () => {
    // Create a mock request without an API key
    const request = { url: 'http://localhost:3000/api/cleanup' };

    // Call the API handler
    const response = await GET(request);

    // Verify the response
    expect(response.status).toBe(401);

    // Parse the response body
    const data = await response.json();

    // Verify the response data
    expect(data).toEqual({ error: 'Unauthorized' });

    // Verify that cleanupOldUploads was not called
    expect(cleanupOldUploads).not.toHaveBeenCalled();
  });

  it('should return 401 if an invalid API key is provided', async () => {
    // Create a mock request with an invalid API key
    const request = { url: 'http://localhost:3000/api/cleanup?key=invalid-key' };

    // Call the API handler
    const response = await GET(request);

    // Verify the response
    expect(response.status).toBe(401);

    // Verify that cleanupOldUploads was not called
    expect(cleanupOldUploads).not.toHaveBeenCalled();
  });

  it('should run cleanup with default maxAge if a valid API key is provided', async () => {
    // Mock cleanupOldUploads to return a successful result
    cleanupOldUploads.mockResolvedValue({ deleted: 5, errors: 0 });

    // Create a mock request with a valid API key
    const request = { url: 'http://localhost:3000/api/cleanup?key=test-api-key' };

    // Call the API handler
    const response = await GET(request);

    // Verify the response
    expect(response.status).toBe(200);

    // Parse the response body
    const data = await response.json();

    // Verify the response data
    expect(data).toEqual({
      success: true,
      message: 'Cleanup complete. Deleted 5 files, encountered 0 errors.',
      deleted: 5,
      errors: 0,
    });

    // Verify that cleanupOldUploads was called with the default maxAge
    expect(cleanupOldUploads).toHaveBeenCalledWith(60 * 60 * 1000); // 60 minutes
  });

  it('should run cleanup with custom maxAge if provided', async () => {
    // Mock cleanupOldUploads to return a successful result
    cleanupOldUploads.mockResolvedValue({ deleted: 3, errors: 1 });

    // Create a mock request with a valid API key and custom maxAge
    const request = { url: 'http://localhost:3000/api/cleanup?key=test-api-key&maxAge=30' };

    // Call the API handler
    const response = await GET(request);

    // Verify the response
    expect(response.status).toBe(200);

    // Parse the response body
    const data = await response.json();

    // Verify the response data
    expect(data).toEqual({
      success: true,
      message: 'Cleanup complete. Deleted 3 files, encountered 1 errors.',
      deleted: 3,
      errors: 1,
    });

    // Verify that cleanupOldUploads was called with the custom maxAge
    expect(cleanupOldUploads).toHaveBeenCalledWith(30 * 60 * 1000); // 30 minutes
  });

  it('should handle errors during cleanup', async () => {
    // Mock cleanupOldUploads to throw an error
    cleanupOldUploads.mockRejectedValue(new Error('Test error'));

    // Create a mock request with a valid API key
    const request = { url: 'http://localhost:3000/api/cleanup?key=test-api-key' };

    // Call the API handler
    const response = await GET(request);

    // Verify the response
    expect(response.status).toBe(500);

    // Parse the response body
    const data = await response.json();

    // Verify the response data
    expect(data).toEqual({
      success: false,
      message: 'Failed to run cleanup',
      error: 'Test error',
    });
  });
});
